import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.P06_BROWSER_BASE_URL ?? 'http://127.0.0.1:8000';
const browserPath = process.env.P06_BROWSER_EXECUTABLE ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const phpPath = process.env.ERP_PHP_BINARY ?? 'C:\\php8.5\\php.exe';
const credentialsPath = path.join(projectRoot, 'storage', 'app', 'private', 'p03-demo-credentials.json');
const screenshotDirectory = path.join(projectRoot, 'docs', 'screenshots');
const profileRoot = path.resolve(projectRoot, 'storage', 'framework', 'testing');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
assert.ok(credentials.editor?.email && credentials.editor?.password, 'Local editor credentials are unavailable.');
assert.ok(credentials.reader?.email && credentials.reader?.password, 'Local reader credentials are unavailable.');
await access(browserPath);
await access(phpPath);
await mkdir(profileRoot, { recursive: true });
await mkdir(screenshotDirectory, { recursive: true });

const profileDirectory = await mkdtemp(path.join(profileRoot, 'p06-browser-'));
const resolvedProfile = path.resolve(profileDirectory);
assert.ok(resolvedProfile.startsWith(`${profileRoot}${path.sep}`), 'Browser profile escaped the ignored test directory.');

let browserProcess;
let secondServer;
let ownsSecondServer = false;
let lockProcess;
let cdp;
let editorAuthenticated = false;
let readerAuthenticated = false;
const browserErrors = [];
const screenshots = [];

class CdpPage {
    constructor(webSocketUrl) {
        this.socket = new WebSocket(webSocketUrl);
        this.nextId = 0;
        this.pending = new Map();
        this.loadEvents = 0;
        this.opened = new Promise((resolve, reject) => {
            this.socket.addEventListener('open', resolve, { once: true });
            this.socket.addEventListener('error', reject, { once: true });
        });
        this.socket.addEventListener('message', (event) => {
            let message;
            try { message = JSON.parse(String(event.data)); } catch { return; }
            if (!message.id) {
                if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails?.text ?? 'Browser JavaScript raised an exception.');
                if (message.method === 'Network.loadingFailed' && message.params.errorText !== 'net::ERR_ABORTED') browserErrors.push(`Browser request failed: ${message.params.errorText ?? 'unknown error'}`);
                if (message.method === 'Page.loadEventFired') this.loadEvents += 1;
                return;
            }
            const pending = this.pending.get(message.id);
            if (!pending) return;
            clearTimeout(pending.timeout);
            this.pending.delete(message.id);
            if (message.error) pending.reject(new Error(`CDP ${pending.method} failed: ${message.error.message}`));
            else pending.resolve(message.result ?? {});
        });
    }

    async send(method, params = {}, timeoutMs = 20000) {
        await this.opened;
        const id = ++this.nextId;
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP ${method} timed out.`)); }, timeoutMs);
            this.pending.set(id, { method, resolve, reject, timeout });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }

    async evaluate(expression) {
        const response = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
        if (response.exceptionDetails) throw new Error(`Browser evaluation failed: ${response.exceptionDetails.text ?? 'unknown error'}`);
        return response.result?.value;
    }

    close() { this.socket.close(); }
}

function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

async function waitUntil(description, predicate, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const value = await cdp.evaluate(predicate());
        if (value) return value;
        await delay(100);
    }
    const snapshot = await cdp.evaluate(`({ path: location.pathname, body: document.body?.innerText?.slice(0, 300) ?? '' })`);
    throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(snapshot)}`);
}

async function waitForPageLoad(previousCount) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        if (cdp.loadEvents > previousCount) return;
        await delay(50);
    }
    throw new Error('Chrome did not finish the current navigation.');
}

async function navigate(pathname) {
    const before = cdp.loadEvents;
    const result = await cdp.send('Page.navigate', { url: new URL(pathname, baseUrl).href });
    assert.ok(result.errorText === undefined || result.errorText === 'net::ERR_ABORTED', 'Chrome navigation failed.');
    await waitForPageLoad(before);
    await waitUntil('React mount', () => `Boolean(document.querySelector('#app')?.firstElementChild)`);
}

async function setInput(selector, value) {
    const changed = await cdp.evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) return false;
        const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value');
        descriptor?.set?.call(element, ${JSON.stringify(value)});
        element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    })()`);
    assert.equal(changed, true, `Required input was not found: ${selector}`);
}

async function setSelect(selector, value) {
    const changed = await cdp.evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) return false;
        const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value');
        descriptor?.set?.call(element, ${JSON.stringify(String(value))});
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    })()`);
    assert.equal(changed, true, `Required select was not found: ${selector}`);
}

async function click(selector) {
    const clicked = await cdp.evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; element.click(); return true; })()`);
    assert.equal(clicked, true, `Required control was not found: ${selector}`);
}

async function submitForm(selector) {
    const submitted = await cdp.evaluate(`(() => { const form = document.querySelector(${JSON.stringify(selector)}); if (!form) return false; form.requestSubmit(); return true; })()`);
    assert.equal(submitted, true, `Required form was not found: ${selector}`);
}

async function pressEnter() {
    const params = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...params });
    await cdp.send('Input.dispatchKeyEvent', { type: 'char', ...params, text: '\r', unmodifiedText: '\r' });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}

async function browserFetch(pathname, method = 'GET', body = undefined, headers = {}) {
    const csrf = method === 'GET' ? '' : await cdp.evaluate(`document.querySelector('meta[name="csrf-token"]')?.content ?? ''`);
    const options = {
        method,
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...(csrf ? { 'X-CSRF-TOKEN': csrf } : {}),
            ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
    const result = await cdp.evaluate(`(async () => {
        const response = await fetch(${JSON.stringify(pathname)}, ${JSON.stringify(options)});
        return { status: response.status, body: await response.text() };
    })()`);
    return { status: result.status, body: result.body ? JSON.parse(result.body) : null };
}

async function captureScreenshot(name, width, height) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await delay(350);
    const image = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    const filename = `p06-${name}-${timestamp}.png`;
    await writeFile(path.join(screenshotDirectory, filename), Buffer.from(image.data, 'base64'));
    screenshots.push({ filename, width, height });
}

async function login(email, password) {
    await navigate('/sign-in');
    await waitUntil('sign-in form', () => `Boolean(document.querySelector('#sign-in-email'))`);
    await setInput('#sign-in-email', email);
    await setInput('#sign-in-password', password);
    await submitForm('.auth-form');
    await waitUntil('workspace after sign-in', () => `location.pathname === '/products'`);
    await waitUntil('workspace shell', () => `Boolean(document.querySelector('.workspace-account-bar'))`);
}

async function changeOrganizationByUi(name) {
    const changed = await cdp.evaluate(`(() => {
        const select = document.querySelector('select[aria-label="انتخاب سازمان فعال"]');
        const option = [...(select?.options ?? [])].find((item) => item.textContent.trim() === ${JSON.stringify(name)});
        if (!select || !option) return false;
        const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(select), 'value');
        descriptor?.set?.call(select, option.value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    })()`);
    assert.equal(changed, true, `Organization selector did not expose ${name}.`);
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        const response = await browserFetch('/api/v1/workspace');
        if (response.status === 200 && response.body.active_organization.name === name) return response.body;
        await delay(100);
    }
    throw new Error(`Organization switch to ${name} did not complete.`);
}

async function sessionCookieHeader() {
    const { cookies = [] } = await cdp.send('Network.getAllCookies');
    const local = cookies.filter((cookie) => cookie.domain.includes('127.0.0.1'));
    assert.ok(local.some((cookie) => cookie.name.toLowerCase().includes('session')), 'Chrome did not retain the local Laravel session cookie.');
    return local.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

async function startBrowser() {
    browserProcess = spawn(browserPath, [
        '--headless=new', '--disable-gpu', '--disable-background-networking', '--disable-sync', '--disable-extensions',
        '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profileDirectory}`,
        '--window-size=1280,900', 'about:blank',
    ], { stdio: 'ignore', windowsHide: true });
    const activePortFile = path.join(profileDirectory, 'DevToolsActivePort');
    const deadline = Date.now() + 15000;
    let port;
    while (Date.now() < deadline) {
        try { [port] = (await readFile(activePortFile, 'utf8')).trim().split(/\r?\n/); if (port) break; }
        catch { if (browserProcess.exitCode !== null) throw new Error('Chrome exited before its debugging endpoint was ready.'); await delay(100); }
    }
    assert.ok(port, 'Chrome did not publish its debugging port.');
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
    const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
    assert.ok(page, 'Chrome did not expose its initial page target.');
    cdp = new CdpPage(page.webSocketDebuggerUrl);
    await cdp.opened;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
}

async function startSecondServer() {
    const primary = new URL(baseUrl);
    const port = Number(primary.port || 80) + 1;
    const secondary = `${primary.protocol}//${primary.hostname}:${port}`;
    try {
        const existing = await fetch(`${secondary}/sign-in`);
        if (existing.status === 200) return secondary;
    } catch { /* Start a local peer when the documented second port is free. */ }
    secondServer = spawn(phpPath, ['artisan', 'serve', '--host=127.0.0.1', `--port=${port}`], {
        cwd: projectRoot, stdio: 'ignore', windowsHide: true,
    });
    ownsSecondServer = true;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        if (secondServer.exitCode !== null) throw new Error(`Second local PHP server exited with code ${secondServer.exitCode}.`);
        try {
            const response = await fetch(`${secondary}/sign-in`);
            if (response.status === 200) return secondary;
        } catch { /* Wait for the second local server to bind. */ }
        await delay(100);
    }
    throw new Error('Second local PHP server did not become ready for the MariaDB contention check.');
}

async function waitForLockWorker() {
    return new Promise((resolve, reject) => {
        let output = '';
        let errors = '';
        const timer = setTimeout(() => reject(new Error(`MariaDB stock lock did not start: ${errors}`)), 10000);
        lockProcess.stdout.on('data', (chunk) => {
            output += String(chunk);
            if (output.includes('LOCKED')) { clearTimeout(timer); resolve(); }
        });
        lockProcess.stderr.on('data', (chunk) => { errors += String(chunk); });
        lockProcess.on('exit', (code) => {
            if (code !== 0 && !output.includes('LOCKED')) { clearTimeout(timer); reject(new Error(`Stock lock worker exited ${code}: ${errors}`)); }
        });
    });
}

async function waitForProcessExit(process) {
    if (!process || process.exitCode !== null) return;
    await new Promise((resolve) => process.once('exit', resolve));
}

async function stopProcess(process) {
    if (!process || process.exitCode !== null) return;
    process.kill();
    await Promise.race([new Promise((resolve) => process.once('exit', resolve)), delay(5000)]);
}

function idempotencyKey(index) {
    return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

let summary;
try {
    await startBrowser();
    await login(credentials.editor.email, credentials.editor.password);
    editorAuthenticated = true;
    let workspace = await browserFetch('/api/v1/workspace');
    assert.equal(workspace.status, 200);
    if (workspace.body.active_organization.name !== 'سازمان پیش‌فرض') {
        workspace = { status: 200, body: await changeOrganizationByUi('سازمان پیش‌فرض') };
    }
    const organizationId = workspace.body.active_organization.id;
    const optionsResponse = await browserFetch('/api/v1/stock/options');
    assert.equal(optionsResponse.status, 200);
    const products = optionsResponse.body.data.products;
    const warehouses = optionsResponse.body.data.warehouses;
    const productA = products.find((item) => item.code === 'P05-DEMO-001');
    const productRace = products.find((item) => item.code === 'P05-DEMO-002');
    const productIssue = products.find((item) => item.code === 'DEMO-002');
    const productUnitless = products.find((item) => item.code === 'DEMO-001');
    const warehouseA = warehouses.find((item) => item.code === 'WH-MAIN');
    const warehouseB = warehouses.find((item) => item.code === 'WH-SECOND');
    const locationA = warehouseA?.locations.find((item) => item.code === 'LOC-A-01');
    const locationB = warehouseB?.locations.find((item) => item.code === 'LOC-B-01');
    assert.ok(productA?.base_unit && productRace?.base_unit && productIssue?.base_unit && productUnitless?.base_unit === null, 'Expected synthetic stock products and unit states are missing.');
    assert.ok(warehouseA && warehouseB && locationA && locationB, 'Expected synthetic P04 stock locations are missing.');
    const operationKey = (type, productId) => ({
        operation_type: type, product_id: productId, quantity: '10.000', warehouse_id: warehouseA.id, location_id: locationA.id,
    });

    const openA = await browserFetch('/api/v1/stock/operations', 'POST', operationKey('opening', productA.id), { 'Idempotency-Key': idempotencyKey(1) });
    assert.equal(openA.status, 201);
    const reservationInput = { product_id: productA.id, quantity: '3.000', warehouse_id: warehouseA.id, location_id: locationA.id };
    const reservation = await browserFetch('/api/v1/stock/reservations', 'POST', reservationInput, { 'Idempotency-Key': idempotencyKey(2) });
    assert.equal(reservation.status, 201);
    let balances = (await browserFetch('/api/v1/stock/balances')).body.data;
    const balanceA = balances.find((item) => item.product.id === productA.id && item.location.id === locationA.id);
    assert.deepEqual([balanceA.physical_quantity, balanceA.reserved_quantity, balanceA.available_quantity], ['10.000', '3.000', '7.000']);
    const firstRelease = await browserFetch(`/api/v1/stock/reservations/${reservation.body.data.id}/release`, 'POST', {});
    const secondRelease = await browserFetch(`/api/v1/stock/reservations/${reservation.body.data.id}/release`, 'POST', {});
    assert.equal(firstRelease.status, 200);
    assert.equal(secondRelease.status, 200);
    assert.equal(secondRelease.body.already_released, true);
    assert.equal(firstRelease.body.data.released_at, secondRelease.body.data.released_at);
    balances = (await browserFetch('/api/v1/stock/balances')).body.data;
    const releasedA = balances.find((item) => item.product.id === productA.id && item.location.id === locationA.id);
    assert.deepEqual([releasedA.physical_quantity, releasedA.reserved_quantity, releasedA.available_quantity], ['10.000', '0.000', '10.000']);

    const transfer = await browserFetch('/api/v1/stock/operations', 'POST', {
        operation_type: 'transfer', product_id: productA.id, quantity: '4.000',
        warehouse_id: warehouseA.id, location_id: locationA.id,
        destination_warehouse_id: warehouseB.id, destination_location_id: locationB.id,
    }, { 'Idempotency-Key': idempotencyKey(3) });
    assert.equal(transfer.status, 201);
    assert.equal(transfer.body.data.legs.length, 2);
    assert.equal(transfer.body.data.from_location.id, locationA.id);
    assert.equal(transfer.body.data.to_location.id, locationB.id);
    balances = (await browserFetch('/api/v1/stock/balances')).body.data;
    const transferA = balances.find((item) => item.product.id === productA.id && item.location.id === locationA.id);
    const transferB = balances.find((item) => item.product.id === productA.id && item.location.id === locationB.id);
    assert.deepEqual([transferA.physical_quantity, transferA.reserved_quantity, transferA.available_quantity], ['6.000', '0.000', '6.000']);
    assert.deepEqual([transferB.physical_quantity, transferB.reserved_quantity, transferB.available_quantity], ['4.000', '0.000', '4.000']);

    const openRace = await browserFetch('/api/v1/stock/operations', 'POST', {
        operation_type: 'opening', product_id: productRace.id, quantity: '1.000', warehouse_id: warehouseA.id, location_id: locationA.id,
    }, { 'Idempotency-Key': idempotencyKey(4) });
    assert.equal(openRace.status, 201);
    const secondaryUrl = await startSecondServer();
    const cookieHeader = await sessionCookieHeader();
    const csrf = await cdp.evaluate(`document.querySelector('meta[name="csrf-token"]')?.content ?? ''`);
    assert.ok(csrf, 'The authenticated browser session has no CSRF token.');
    lockProcess = spawn(phpPath, [path.join(projectRoot, 'scripts', 'Lock-P06StockForConcurrency.php'), String(organizationId), String(productRace.id), String(locationA.id)], {
        cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    await waitForLockWorker();
    let settled = 0;
    const racePayload = { product_id: productRace.id, quantity: '1.000', warehouse_id: warehouseA.id, location_id: locationA.id };
    const sendReservation = (url, key) => fetch(`${url}/api/v1/stock/reservations`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Cookie: cookieHeader, 'X-CSRF-TOKEN': csrf, 'Idempotency-Key': key },
        body: JSON.stringify(racePayload),
    }).then(async (response) => ({ status: response.status, body: await response.json() }));
    const raceRequests = [
        sendReservation(baseUrl, idempotencyKey(5)).finally(() => { settled += 1; }),
        sendReservation(secondaryUrl, idempotencyKey(6)).finally(() => { settled += 1; }),
    ];
    await delay(400);
    assert.equal(settled, 0, 'Both stock reservation requests must remain blocked behind the held MariaDB stock-key lock.');
    const raceResponses = await Promise.all(raceRequests);
    await waitForProcessExit(lockProcess);
    lockProcess = null;
    assert.deepEqual(raceResponses.map((item) => item.status).sort(), [201, 422], 'Exactly one last-unit reservation must succeed.');
    const openRaceReservations = (await browserFetch('/api/v1/stock/reservations')).body.data
        .filter((item) => item.product.id === productRace.id && item.location.id === locationA.id && item.status === 'open');
    assert.equal(openRaceReservations.length, 1);
    assert.equal(openRaceReservations[0].quantity, '1.000');
    balances = (await browserFetch('/api/v1/stock/balances')).body.data;
    const raceBalance = balances.find((item) => item.product.id === productRace.id && item.location.id === locationA.id);
    assert.deepEqual([raceBalance.physical_quantity, raceBalance.reserved_quantity, raceBalance.available_quantity], ['1.000', '1.000', '0.000']);

    const issueOpening = await browserFetch('/api/v1/stock/operations', 'POST', {
        operation_type: 'opening', product_id: productIssue.id, quantity: '10.000', warehouse_id: warehouseB.id, location_id: locationB.id,
    }, { 'Idempotency-Key': idempotencyKey(7) });
    assert.equal(issueOpening.status, 201);
    const issueReservation = await browserFetch('/api/v1/stock/reservations', 'POST', {
        product_id: productIssue.id, quantity: '3.000', warehouse_id: warehouseB.id, location_id: locationB.id,
    }, { 'Idempotency-Key': idempotencyKey(8) });
    assert.equal(issueReservation.status, 201);
    const issue8 = await browserFetch('/api/v1/stock/operations', 'POST', {
        operation_type: 'issue', product_id: productIssue.id, quantity: '8.000', warehouse_id: warehouseB.id, location_id: locationB.id,
    }, { 'Idempotency-Key': idempotencyKey(9) });
    assert.equal(issue8.status, 422);
    const issueFraction = await browserFetch('/api/v1/stock/operations', 'POST', {
        operation_type: 'issue', product_id: productIssue.id, quantity: '2.500', warehouse_id: warehouseB.id, location_id: locationB.id,
    }, { 'Idempotency-Key': idempotencyKey(10) });
    assert.equal(issueFraction.status, 201);
    const excessPrecision = await browserFetch('/api/v1/stock/operations', 'POST', {
        operation_type: 'issue', product_id: productIssue.id, quantity: '0.0001', warehouse_id: warehouseB.id, location_id: locationB.id,
    }, { 'Idempotency-Key': idempotencyKey(11) });
    assert.equal(excessPrecision.status, 422);
    const missingUnit = await browserFetch('/api/v1/stock/operations', 'POST', {
        operation_type: 'receipt', product_id: productUnitless.id, quantity: '1.000', warehouse_id: warehouseA.id, location_id: locationA.id,
    }, { 'Idempotency-Key': idempotencyKey(12) });
    assert.equal(missingUnit.status, 422);
    balances = (await browserFetch('/api/v1/stock/balances')).body.data;
    const issueBalance = balances.find((item) => item.product.id === productIssue.id && item.location.id === locationB.id);
    assert.deepEqual([issueBalance.physical_quantity, issueBalance.reserved_quantity, issueBalance.available_quantity], ['7.500', '3.000', '4.500']);

    const wrongPair = await browserFetch('/api/v1/stock/operations', 'POST', {
        operation_type: 'receipt', product_id: productIssue.id, quantity: '1.000', warehouse_id: warehouseA.id, location_id: locationB.id,
    }, { 'Idempotency-Key': idempotencyKey(13) });
    assert.equal(wrongPair.status, 422);

    await navigate('/stock');
    await waitUntil('balance workspace', () => `Boolean(document.querySelector('.stock-balance-panel'))`);
    const beforeUiIssue = (await browserFetch('/api/v1/stock/movements')).body.data.length;
    await setSelect('#stock-operation-type', 'issue');
    await setSelect('#stock-operation-product', productIssue.id);
    await setSelect('#stock-source-warehouse', warehouseB.id);
    await setSelect('#stock-source-location', locationB.id);
    await setInput('#stock-operation-quantity', '8.000');
    await cdp.evaluate(`document.querySelector('#stock-operation-quantity')?.focus()`);
    await pressEnter();
    const uiValidation = await waitUntil('stock form validation feedback', () => `document.querySelector('.stock-feedback')?.innerText.includes('موجودی قابل‌دسترس')`);
    const afterUiIssue = (await browserFetch('/api/v1/stock/movements')).body.data.length;
    assert.equal(afterUiIssue, beforeUiIssue, 'Rejected UI issue changed movement history.');
    const fieldLabels = await cdp.evaluate(`({
        operation: document.querySelector('label[for="stock-operation-type"]')?.innerText,
        quantity: document.querySelector('label[for="stock-operation-quantity"]')?.innerText,
        focused: document.activeElement?.id,
        focusOutline: getComputedStyle(document.activeElement).outlineStyle,
    })`);
    assert.ok(fieldLabels.operation && fieldLabels.quantity && fieldLabels.focused === 'stock-operation-quantity');
    await captureScreenshot('balances-desktop', 1280, 900);

    await navigate('/stock/movements');
    await waitUntil('movement history', () => `document.querySelector('.stock-history-panel')?.innerText.includes('STK-')`);
    const transferVisible = await cdp.evaluate(`document.querySelector('.stock-history-panel')?.innerText.includes('قفسه A-01') && document.querySelector('.stock-history-panel')?.innerText.includes('قفسه B-01')`);
    assert.equal(transferVisible, true, 'Transfer history does not display both locations.');
    await captureScreenshot('movements-desktop', 1280, 900);

    await navigate('/stock/reservations');
    await waitUntil('reservation workspace', () => `Boolean(document.querySelector('.stock-reservation-table'))`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await cdp.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
    await delay(250);
    const mobileMetrics = await cdp.evaluate(`({
        width: window.innerWidth, height: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
        lastPanelBottom: document.querySelector('.stock-entry-panel')?.getBoundingClientRect().bottom ?? null,
        dockTop: document.querySelector('.mobile-focus-dock')?.getBoundingClientRect().top ?? null,
    })`);
    assert.equal(mobileMetrics.width, 390);
    assert.equal(mobileMetrics.height, 844);
    assert.ok(mobileMetrics.documentWidth <= mobileMetrics.clientWidth + 1, `P06 mobile view has horizontal overflow: ${JSON.stringify(mobileMetrics)}`);
    assert.ok(mobileMetrics.lastPanelBottom <= mobileMetrics.dockTop, `P06 reservation form overlaps the mobile dock: ${JSON.stringify(mobileMetrics)}`);
    await captureScreenshot('reservations-mobile', 390, 844);

    await navigate('/stock?glass=fallback&scene=bright');
    await waitUntil('forced glass fallback', () => `Boolean(document.querySelector('.stock-balance-panel'))`);
    const fallback = await cdp.evaluate(`({ surfaces: document.querySelectorAll('.lg-surface').length, refraction: document.querySelectorAll('.lg-surface.lg-svg-ok').length })`);
    assert.ok(fallback.surfaces > 0);
    assert.equal(fallback.refraction, 0);
    await captureScreenshot('fallback-mobile', 390, 844);

    await click('.sign-out-button');
    await waitUntil('editor signed out', () => `location.pathname === '/sign-in'`);
    editorAuthenticated = false;
    await login(credentials.reader.email, credentials.reader.password);
    readerAuthenticated = true;
    const readerContext = await browserFetch('/api/v1/workspace');
    assert.equal(readerContext.body.active_organization.role, 'reader');
    await navigate('/stock/reservations');
    await waitUntil('reader stock reservations', () => `Boolean(document.querySelector('.stock-reservation-table'))`);
    assert.equal(await cdp.evaluate(`Boolean(document.querySelector('.stock-form'))`), false, 'Reader saw a stock write form.');
    assert.equal(await cdp.evaluate(`Boolean(document.querySelector('.stock-release-button'))`), false, 'Reader saw a reservation release action.');
    assert.equal((await browserFetch('/api/v1/stock/balances')).status, 200);
    const readerWrite = await browserFetch('/api/v1/stock/reservations', 'POST', reservationInput, { 'Idempotency-Key': idempotencyKey(14) });
    assert.equal(readerWrite.status, 403);

    assert.deepEqual(browserErrors, [], 'Chrome reported JavaScript errors or failed requests.');
    summary = {
        browser: 'Google Chrome headless',
        viewports: ['1280x900', '390x844', '390x844 forced bright fallback'],
        organizationId,
        fixtures: {
            productA: { id: productA.id, code: productA.code, unit: productA.base_unit.code },
            productRace: { id: productRace.id, code: productRace.code, unit: productRace.base_unit.code },
            productIssue: { id: productIssue.id, code: productIssue.code, unit: productIssue.base_unit.code },
            productUnitless: { id: productUnitless.id, code: productUnitless.code },
            locationA: { id: locationA.id, code: locationA.code }, locationB: { id: locationB.id, code: locationB.code },
        },
        reserveAndRelease: ['10.000/3.000/7.000', '10.000/0.000/10.000'],
        transfer: { operationId: transfer.body.data.id, legs: transfer.body.data.legs.length, balances: ['6.000', '4.000'] },
        race: { overlappingRequests: 2, pendingBehindLockAt400ms: true, statuses: raceResponses.map((item) => item.status), openReservations: openRaceReservations.length, balance: ['1.000', '1.000', '0.000'] },
        issue: { rejected8: issue8.status, accepted2_500: issueFraction.status, excessPrecision: excessPrecision.status, missingBaseUnit: missingUnit.status, balance: ['7.500', '3.000', '4.500'] },
        wrongWarehouseLocation: wrongPair.status,
        ui: { rejectedIssueFeedback: uiValidation, movementsUnchanged: true, labels: fieldLabels },
        mobileMetrics, forcedFallback: fallback,
        reader: { writeStatus: readerWrite.status, balancesView: true, formsHidden: true },
        screenshots, runtimeErrors: browserErrors.length,
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} finally {
    if (lockProcess) await stopProcess(lockProcess);
    if (ownsSecondServer) await stopProcess(secondServer);
    try { await cdp?.send('Browser.close', {}, 10000); } catch { /* Chrome may already be closing after a failed check. */ }
    cdp?.close();
    await stopProcess(browserProcess);
    await delay(300);
    await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
}
