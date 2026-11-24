import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.P08_BROWSER_BASE_URL ?? 'http://127.0.0.1:8000';
const browserPath = process.env.P08_BROWSER_EXECUTABLE ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const phpPath = process.env.ERP_PHP_BINARY ?? 'C:\\php8.5\\php.exe';
const editorCredentialsPath = path.join(projectRoot, 'storage', 'app', 'private', 'p03-demo-credentials.json');
const approverCredentialsPath = path.join(projectRoot, 'storage', 'app', 'private', 'p08-approver-credentials.json');
const screenshotDirectory = path.join(projectRoot, 'docs', 'screenshots');
const profileRoot = path.resolve(projectRoot, 'storage', 'framework', 'testing');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const suffix = Date.now().toString(36).toUpperCase();
const editorCredentials = JSON.parse(await readFile(editorCredentialsPath, 'utf8')).editor;
const approverCredentials = JSON.parse(await readFile(approverCredentialsPath, 'utf8')).approver;
assert.ok(editorCredentials?.email && editorCredentials?.password, 'Local P03 editor credentials are unavailable.');
assert.ok(approverCredentials?.email && approverCredentials?.password, 'Local P08 approver credentials are unavailable.');
await access(browserPath);
await access(phpPath);
await mkdir(profileRoot, { recursive: true });
await mkdir(screenshotDirectory, { recursive: true });

const profileDirectory = await mkdtemp(path.join(profileRoot, 'p08-browser-'));
const resolvedProfile = path.resolve(profileDirectory);
assert.ok(resolvedProfile.startsWith(`${profileRoot}${path.sep}`), 'Browser profile escaped the ignored test directory.');

let browserProcess;
let secondServer;
let lockProcess;
let cdp;
let runFailure = null;
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
                if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails?.text ?? 'Chrome raised a JavaScript exception.');
                if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) {
                    const detail = (message.params.args ?? []).map((item) => item.value ?? item.description ?? '').join(' ');
                    browserErrors.push(`Chrome console ${message.params.type}: ${detail}`);
                }
                if (message.method === 'Log.entryAdded'
                    && message.params.entry.source === 'javascript'
                    && ['error', 'warning'].includes(message.params.entry.level)) {
                    browserErrors.push(`Chrome log ${message.params.entry.level}: ${message.params.entry.text ?? ''}`);
                }
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

function uuid() { return crypto.randomUUID(); }

function expectStatus(response, expected, action) {
    assert.equal(response.status, expected, `${action} returned ${response.status}: ${JSON.stringify(response.body)}`);
}

async function waitUntil(description, predicate, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const value = await cdp.evaluate(predicate());
        if (value) return value;
        await delay(100);
    }
    const snapshot = await cdp.evaluate(`({
        path: location.pathname,
        title: document.title,
        readyState: document.readyState,
        body: document.body?.innerText?.slice(0, 300) ?? '',
        rootExists: Boolean(document.querySelector('#app')),
        rootPage: document.querySelector('#app')?.dataset.page ?? null,
        rootChildren: document.querySelector('#app')?.children.length ?? null,
        scripts: [...document.scripts].map((script) => script.src ? new URL(script.src).pathname : 'inline'),
        scriptResources: performance.getEntriesByType('resource')
            .filter((item) => item.initiatorType === 'script')
            .map((item) => ({ path: new URL(item.name).pathname, duration: Math.round(item.duration), transfer: item.transferSize })),
    })`);
    throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(snapshot)}; browser errors: ${JSON.stringify(browserErrors)}`);
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
    await waitUntil('React workspace mount', () => `Boolean(document.querySelector('#app')?.firstElementChild)`);
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

async function clickButtonContaining(text) {
    const clicked = await cdp.evaluate(`(() => {
        const button = [...document.querySelectorAll('button')].find((item) => item.innerText.includes(${JSON.stringify(text)}));
        if (!button) return false;
        button.click();
        return true;
    })()`);
    assert.equal(clicked, true, `Button was not found: ${text}`);
}

async function submitForm(selector) {
    const submitted = await cdp.evaluate(`(() => { const form = document.querySelector(${JSON.stringify(selector)}); if (!form) return false; form.requestSubmit(); return true; })()`);
    assert.equal(submitted, true, `Required form was not found: ${selector}`);
}

async function pressKey(key) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: key === 'Tab' ? 9 : undefined });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: key === 'Tab' ? 9 : undefined });
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
    await delay(300);
    const image = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    const filename = `p08-${name}-${timestamp}.png`;
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

async function logout() {
    await clickButtonContaining('خروج');
    await waitUntil('sign-out redirect', () => `location.pathname === '/sign-in'`);
}

async function switchToDefaultOrganization() {
    const workspace = await browserFetch('/api/v1/workspace');
    expectStatus(workspace, 200, 'Read active workspace');
    const defaultOrganization = workspace.body.organizations.find((item) => item.name === 'سازمان پیش‌فرض' && item.role === 'editor');
    assert.ok(defaultOrganization, 'The local editor/approver membership for the default organization is unavailable.');
    if (workspace.body.active_organization.id === defaultOrganization.id) return defaultOrganization.id;

    const switched = await cdp.evaluate(`(() => {
        const select = document.querySelector('select[aria-label="انتخاب سازمان فعال"]');
        if (!select) return false;
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(select), 'value')?.set;
        setter?.call(select, ${JSON.stringify(String(defaultOrganization.id))});
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    })()`);
    assert.equal(switched, true, 'The organization selector was unavailable.');
    await waitUntil('default organization switch', () => `(async () => {
        const response = await fetch('/api/v1/workspace', { credentials: 'include', headers: { Accept: 'application/json' } });
        if (!response.ok) return false;
        const value = await response.json();
        return value.active_organization?.id === ${Number(defaultOrganization.id)};
    })()`);

    return defaultOrganization.id;
}

async function sessionCookieHeader() {
    const { cookies = [] } = await cdp.send('Network.getAllCookies');
    const local = cookies.filter((cookie) => cookie.domain.includes('127.0.0.1'));
    assert.ok(local.some((cookie) => cookie.name.toLowerCase().includes('session')), 'Chrome did not retain a local session cookie.');
    return local.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

async function startBrowser() {
    browserProcess = spawn(browserPath, [
        '--headless=new', '--disable-gpu', '--disable-background-networking', '--disable-sync', '--disable-extensions', '--no-proxy-server',
        '--disable-features=OptimizationGuideModelDownloading,OptimizationGuideOnDeviceModel,OptimizationGuidePredictionModel',
        '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profileDirectory}`,
        '--window-size=1280,900', 'about:blank',
    ], { stdio: 'ignore', windowsHide: true });
    const activePortFile = path.join(profileDirectory, 'DevToolsActivePort');
    const deadline = Date.now() + 15000;
    let port;
    while (Date.now() < deadline) {
        try {
            [port] = (await readFile(activePortFile, 'utf8')).trim().split(/\r?\n/);
            if (port) break;
        } catch {
            if (browserProcess.exitCode !== null) throw new Error('Chrome exited before its debugging endpoint was ready.');
            await delay(100);
        }
    }
    assert.ok(port, 'Chrome did not expose its temporary debugging port.');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find((item) => item.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Chrome did not return a page debugging target.');
    cdp = new CdpPage(page.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Log.enable');
}

async function startSecondServer() {
    const port = await new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const selected = typeof address === 'object' && address !== null ? address.port : 0;
            server.close((error) => error ? reject(error) : resolve(selected));
        });
    });
    secondServer = spawn(phpPath, ['artisan', 'serve', '--host=127.0.0.1', `--port=${port}`], {
        cwd: projectRoot,
        stdio: 'ignore',
        windowsHide: true,
    });
    const url = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${url}/sign-in`);
            if (response.ok) return url;
        } catch { /* Wait for Laravel's local server to become ready. */ }
        if (secondServer.exitCode !== null) throw new Error(`Second Laravel server exited with code ${secondServer.exitCode}.`);
        await delay(100);
    }
    throw new Error('The second local Laravel server did not start.');
}

async function waitForLockWorker() {
    return new Promise((resolve, reject) => {
        let output = '';
        let errors = '';
        const timer = setTimeout(() => reject(new Error(`Purchase order lock worker timed out: ${errors}`)), 15000);
        lockProcess.stdout.on('data', (chunk) => {
            output += String(chunk);
            if (output.includes('LOCKED')) { clearTimeout(timer); resolve(); }
        });
        lockProcess.stderr.on('data', (chunk) => { errors += String(chunk); });
        lockProcess.on('exit', (code) => {
            if (code !== 0 && !output.includes('LOCKED')) { clearTimeout(timer); reject(new Error(`Lock worker exited ${code}: ${errors}`)); }
        });
    });
}

async function stopProcess(process) {
    if (!process || process.exitCode !== null) return;
    process.kill();
    await Promise.race([new Promise((resolve) => process.once('exit', resolve)), delay(5000)]);
}

async function stopChromeTree(child) {
    if (!child) return;
    if (process.platform === 'win32' && child.pid && child.exitCode === null) {
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        await new Promise((resolve) => killer.once('exit', resolve));
    }
    await stopProcess(child);
}

async function requestWithSession(url, cookie, csrf, pathName, body, key) {
    const response = await fetch(`${url}${pathName}`, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Cookie: cookie,
            'X-CSRF-TOKEN': csrf,
            'Idempotency-Key': key,
        },
        body: JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function createRequestThroughApi(productId, quantity, title) {
    const response = await browserFetch('/api/v1/purchase-requests', 'POST', {
        title,
        lines: [{ product_id: productId, quantity }],
    });
    expectStatus(response, 201, 'Create synthetic concurrency request');
    expectStatus(await browserFetch(`/api/v1/purchase-requests/${response.body.data.id}/submit`, 'POST', {}), 200, 'Submit concurrency request');
    return response.body.data;
}

async function readBalance(productId, locationId) {
    const response = await browserFetch('/api/v1/stock/balances');
    expectStatus(response, 200, 'Read stock balances');
    const row = response.body.data.find((item) => item.product.id === productId && item.location.id === locationId);
    assert.ok(row, `Stock balance for product ${productId} and location ${locationId} was not found.`);
    return [row.physical_quantity, row.reserved_quantity, row.available_quantity];
}

let summary;
try {
    await startBrowser();
    await login(editorCredentials.email, editorCredentials.password);
    const organizationId = await switchToDefaultOrganization();
    await navigate('/purchase-requests');
    await waitUntil('P08 purchase request workspace', () => `Boolean(document.querySelector('[data-testid="purchase-request-create-form"]'))`);

    const optionsResponse = await browserFetch('/api/v1/purchases/options');
    expectStatus(optionsResponse, 200, 'Read purchase options');
    const supplier = optionsResponse.body.data.suppliers[0];
    const unit = optionsResponse.body.data.products.find((item) => item.base_unit)?.base_unit;
    assert.ok(supplier && unit, 'A local synthetic supplier or active base unit is unavailable.');

    const code = `P08-${suffix}`;
    const productResponse = await browserFetch('/api/v1/products', 'POST', {
        code: `${code}-P`, name: `کالای پذیرش خرید ${suffix}`, base_unit_id: unit.id,
    });
    expectStatus(productResponse, 201, 'Create synthetic P08 product');
    const productId = productResponse.body.data.id;
    const warehouseResponse = await browserFetch('/api/v1/warehouses', 'POST', {
        code: `${code}-WH`, name: `انبار پذیرش ${suffix}`,
    });
    expectStatus(warehouseResponse, 201, 'Create synthetic P08 warehouse');
    const warehouseId = warehouseResponse.body.data.id;
    const locationResponse = await browserFetch('/api/v1/locations', 'POST', {
        warehouse_id: warehouseId, code: `${code}-LOC`, name: `مکان پذیرش ${suffix}`,
    });
    expectStatus(locationResponse, 201, 'Create synthetic P08 location');
    const locationId = locationResponse.body.data.id;
    const wrongWarehouseResponse = await browserFetch('/api/v1/warehouses', 'POST', {
        code: `${code}-WH-2`, name: `انبار دیگر ${suffix}`,
    });
    expectStatus(wrongWarehouseResponse, 201, 'Create a second synthetic warehouse');
    const wrongLocationResponse = await browserFetch('/api/v1/locations', 'POST', {
        warehouse_id: wrongWarehouseResponse.body.data.id, code: `${code}-LOC-2`, name: `مکان دیگر ${suffix}`,
    });
    expectStatus(wrongLocationResponse, 201, 'Create a location in the second warehouse');

    expectStatus(await browserFetch('/api/v1/stock/operations', 'POST', {
        operation_type: 'opening', product_id: productId, quantity: '10.000', warehouse_id: warehouseId, location_id: locationId,
    }, { 'Idempotency-Key': uuid() }), 201, 'Open synthetic stock for P08');
    expectStatus(await browserFetch('/api/v1/stock/reservations', 'POST', {
        product_id: productId, quantity: '4.000', warehouse_id: warehouseId, location_id: locationId,
    }, { 'Idempotency-Key': uuid() }), 201, 'Reserve stock before P08 receipts');
    assert.deepEqual(await readBalance(productId, locationId), ['10.000', '4.000', '6.000']);

    await navigate('/purchase-requests');
    await waitUntil('refreshed P08 request form', () => `Boolean(document.querySelector('[data-testid="purchase-request-line-product-0"]'))`);
    await setInput('#purchase-request-title', `درخواست خرید پذیرش ${suffix}`);
    await setSelect('#purchase-request-line-product-0', productId);
    await setInput('#purchase-request-line-quantity-0', '5.000');
    await cdp.evaluate(`document.querySelector('#purchase-request-title')?.focus()`);
    await pressKey('Tab');
    await pressKey('Tab');
    const keyboardFocus = await cdp.evaluate(`({ id: document.activeElement?.id ?? '', outline: getComputedStyle(document.activeElement).outlineWidth })`);
    assert.equal(keyboardFocus.id, 'purchase-request-line-quantity-0', 'Tab did not reach the request quantity field.');
    assert.notEqual(keyboardFocus.outline, '0px', 'Keyboard focus is not visibly indicated on the request quantity.');
    await submitForm('[data-testid="purchase-request-create-form"]');
    await waitUntil('created P08 request detail', () => `location.pathname.startsWith('/purchase-requests/') && Boolean(document.querySelector('[data-testid="purchase-request-submit"]'))`);
    const requestId = Number((await cdp.evaluate('location.pathname.split("/").pop()')));
    const sourceRequest = await browserFetch(`/api/v1/purchase-requests/${requestId}`);
    expectStatus(sourceRequest, 200, 'Read the new P08 request');
    assert.equal(sourceRequest.body.data.requester.id, optionsResponse.body.current_user_id);
    assert.equal(sourceRequest.body.data.lines[0].quantity, '5.000');

    await click('[data-testid="purchase-request-submit"]');
    await waitUntil('submitted P08 request', () => `document.body.innerText.includes('در انتظار تأیید')`);
    const selfApproval = await browserFetch(`/api/v1/purchase-requests/${requestId}/approve`, 'POST', {});
    expectStatus(selfApproval, 403, 'Reject requester self-approval');
    const selfApprovalButton = await cdp.evaluate(`Boolean(document.querySelector('[data-testid="purchase-request-approve"]'))`);
    assert.equal(selfApprovalButton, false, 'The requester must not see their self-approval action.');
    await captureScreenshot('request-awaiting-approval-desktop', 1280, 900);

    await logout();
    await login(approverCredentials.email, approverCredentials.password);
    await switchToDefaultOrganization();
    await navigate(`/purchase-requests/${requestId}`);
    await waitUntil('separate P08 approver action', () => `Boolean(document.querySelector('[data-testid="purchase-request-approve"]'))`);
    await captureScreenshot('request-approver-desktop', 1280, 900);
    await click('[data-testid="purchase-request-approve"]');
    await waitUntil('approved P08 request', () => `document.body.innerText.includes('تأییدشده')`);
    const approvedRequest = await browserFetch(`/api/v1/purchase-requests/${requestId}`);
    expectStatus(approvedRequest, 200, 'Read approved P08 request');
    assert.equal(approvedRequest.body.data.status, 'approved');
    assert.ok(approvedRequest.body.data.approved_by);
    assert.ok(approvedRequest.body.data.approved_at);

    await logout();
    await login(editorCredentials.email, editorCredentials.password);
    await switchToDefaultOrganization();
    await navigate(`/purchase-requests/${requestId}`);
    await waitUntil('P08 conversion form', () => `Boolean(document.querySelector('[data-testid="purchase-order-convert-form"]'))`);
    const orderPrice = '100000';
    await setSelect('#purchase-supplier-select', supplier.id);
    const requestLineId = approvedRequest.body.data.lines[0].id;
    await setInput(`#purchase-order-price-${requestLineId}`, orderPrice);
    await submitForm('[data-testid="purchase-order-convert-form"]');
    await waitUntil('converted P08 order', () => `location.pathname.startsWith('/purchase-orders/') && Boolean(document.querySelector('[data-testid^="purchase-order-line-"]'))`);
    const orderId = Number((await cdp.evaluate('location.pathname.split("/").pop()')));
    const converted = await browserFetch(`/api/v1/purchase-orders/${orderId}`);
    expectStatus(converted, 200, 'Read converted purchase order');
    assert.equal(converted.body.data.total_rial, '500000');
    assert.equal(converted.body.data.lines[0].unit_price_rial, orderPrice);
    assert.equal(converted.body.data.lines[0].product_name, productResponse.body.data.name);
    const conversionInput = {
        supplier_party_id: supplier.id,
        lines: [{ source_request_line_id: requestLineId, unit_price_rial: orderPrice }],
    };
    const conversionRetry = await browserFetch(`/api/v1/purchase-requests/${requestId}/convert`, 'POST', conversionInput);
    expectStatus(conversionRetry, 200, 'Retry P08 order conversion');
    assert.equal(conversionRetry.body.data.id, orderId);
    expectStatus(await browserFetch(`/api/v1/purchase-requests/${requestId}/convert`, 'POST', {
        ...conversionInput,
        lines: [{ source_request_line_id: requestLineId, unit_price_rial: '100001' }],
    }), 409, 'Reject conflicting P08 conversion retry');
    await captureScreenshot('purchase-order-desktop', 1280, 900);

    const lineId = converted.body.data.lines[0].id;
    expectStatus(await browserFetch(`/api/v1/purchase-orders/${orderId}/lines/${lineId}/receipts`, 'POST', {
        warehouse_id: warehouseId, location_id: wrongLocationResponse.body.data.id, quantity: '1.000',
    }, { 'Idempotency-Key': uuid() }), 422, 'Reject mismatched warehouse/location pair');

    await setSelect(`#purchase-receipt-warehouse-${lineId}`, warehouseId);
    await setSelect(`#purchase-receipt-location-${lineId}`, locationId);
    await setInput(`#purchase-receipt-quantity-${lineId}`, '6.000');
    await submitForm(`[data-testid="purchase-receipt-form-${lineId}"]`);
    await waitUntil('P08 receipt validation feedback', () => `Boolean(document.querySelector('.purchase-feedback[role="alert"]'))`);
    assert.ok((await cdp.evaluate(`document.querySelector('.purchase-feedback[role="alert"]')?.innerText ?? ''`)).includes('باقیمانده'));
    assert.deepEqual(await readBalance(productId, locationId), ['10.000', '4.000', '6.000']);
    await setInput(`#purchase-receipt-quantity-${lineId}`, '3.000');
    await cdp.evaluate(`document.querySelector('#purchase-receipt-warehouse-${lineId}')?.focus()`);
    await pressKey('Tab');
    await pressKey('Tab');
    await pressKey('Tab');
    const receiptKeyboardFocus = await cdp.evaluate(`(() => {
        const form = document.querySelector('[data-testid="purchase-receipt-form-${lineId}"]');
        return { isSubmit: document.activeElement === form?.querySelector('button[type="submit"]'), outline: getComputedStyle(document.activeElement).outlineWidth };
    })()`);
    assert.equal(receiptKeyboardFocus.isSubmit, true, 'Tab did not reach the receipt submit action.');
    const receiptButtonFocus = receiptKeyboardFocus;
    assert.notEqual(receiptButtonFocus.outline, '0px', 'Receipt action lacks a visible focus outline.');
    await submitForm(`[data-testid="purchase-receipt-form-${lineId}"]`);
    await waitUntil('first partial P08 receipt', () => `Boolean(document.querySelector('[data-testid="purchase-order-line-${lineId}"] .purchase-receipt'))`);
    const afterThree = await browserFetch(`/api/v1/purchase-orders/${orderId}`);
    expectStatus(afterThree, 200, 'Read P08 order after 3.000 receipt');
    assert.equal(afterThree.body.data.status, 'open');
    assert.equal(afterThree.body.data.lines[0].received_quantity, '3.000');
    assert.equal(afterThree.body.data.lines[0].remaining_quantity, '2.000');
    assert.deepEqual(await readBalance(productId, locationId), ['13.000', '4.000', '9.000']);
    await cdp.evaluate(`document.querySelector('[data-testid="purchase-order-line-${lineId}"]')?.scrollIntoView({ block: 'center' })`);
    await captureScreenshot('receipt-partial-desktop', 1280, 900);

    await setInput(`#purchase-receipt-quantity-${lineId}`, '2.000');
    await submitForm(`[data-testid="purchase-receipt-form-${lineId}"]`);
    await waitUntil('final UI receipt and order closeout', () => `document.querySelector('[data-testid="purchase-order-detail-${orderId}"]')?.innerText.includes('دریافت کامل')`);
    const finalKey = await cdp.evaluate(`document.querySelector('[data-testid="purchase-order-line-${lineId}"]')?.getAttribute('data-last-receipt-key') ?? ''`);
    assert.match(finalKey, /^[0-9a-f-]{36}$/i, 'The final UI receipt idempotency key was not retained for replay verification.');
    const finalPayload = { warehouse_id: warehouseId, location_id: locationId, quantity: '2.000' };
    const finalReceipt = await browserFetch(`/api/v1/purchase-orders/${orderId}`);
    expectStatus(finalReceipt, 200, 'Read the final UI receipt');
    assert.equal(finalReceipt.body.data.status, 'closed');
    const finalLine = finalReceipt.body.data.lines[0];
    assert.equal(finalLine.received_quantity, '5.000');
    assert.equal(finalLine.remaining_quantity, '0.000');
    const lastReceipt = finalLine.receipts.at(-1);
    const replay = await browserFetch(`/api/v1/purchase-orders/${orderId}/lines/${lineId}/receipts`, 'POST', finalPayload, { 'Idempotency-Key': finalKey });
    expectStatus(replay, 200, 'Replay a receipt after order closeout');
    assert.equal(replay.body.data.lines[0].receipts.at(-1).id, lastReceipt.id);
    assert.equal(replay.body.data.lines[0].receipts.at(-1).operation.id, lastReceipt.operation.id);
    assert.equal(replay.body.data.lines[0].receipts.at(-1).movement.id, lastReceipt.movement.id);
    expectStatus(await browserFetch(`/api/v1/purchase-orders/${orderId}/lines/${lineId}/receipts`, 'POST', {
        ...finalPayload, quantity: '1.999',
    }, { 'Idempotency-Key': finalKey }), 409, 'Reject a changed receipt retry payload');
    assert.deepEqual(await readBalance(productId, locationId), ['15.000', '4.000', '11.000']);
    await cdp.evaluate(`document.querySelector('[data-testid="purchase-order-line-${lineId}"]')?.scrollIntoView({ block: 'center' })`);
    await captureScreenshot('purchase-order-complete-desktop', 1280, 900);

    await navigate(`/purchase-orders/${orderId}`);
    await waitUntil('closed P08 order history', () => `document.body.innerText.includes('دریافت کامل') && document.querySelectorAll('.purchase-receipt').length === 2`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await cdp.evaluate(`window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })`);
    const mobileMetrics = await cdp.evaluate(`(() => {
        const line = document.querySelector('[data-testid="purchase-order-line-${lineId}"]')?.getBoundingClientRect();
        const panel = document.querySelector('.purchase-focus .purchase-panel:last-child')?.getBoundingClientRect();
        const dock = document.querySelector('.mobile-focus-dock')?.getBoundingClientRect();
        return {
            innerWidth: window.innerWidth,
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            lineBottom: line?.bottom ?? null,
            panelBottom: panel?.bottom ?? null,
            dockTop: dock?.top ?? null,
            dockGap: panel && dock ? dock.top - panel.bottom : null,
        };
    })()`);
    assert.equal(mobileMetrics.scrollWidth, mobileMetrics.clientWidth, 'P08 order history has horizontal overflow at 390×844.');
    assert.ok(typeof mobileMetrics.dockGap === 'number' && mobileMetrics.dockGap >= 0, 'The final P08 line/receipt history does not clear the fixed mobile dock.');
    await captureScreenshot('purchase-order-mobile', 390, 844);

    await navigate(`/purchase-orders/${orderId}?glass=fallback&scene=bright`);
    await waitUntil('forced P08 bright fallback', () => `Boolean(document.querySelector('[data-testid="purchase-order-detail-${orderId}"]'))`);
    await cdp.evaluate(`window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })`);
    const fallback = await cdp.evaluate(`({ surfaces: document.querySelectorAll('.lg-surface').length, svgSurfaces: document.querySelectorAll('.lg-surface.lg-svg-ok').length })`);
    assert.ok(fallback.surfaces > 0, 'Forced fallback removed the shared glass shell controls.');
    assert.equal(fallback.svgSurfaces, 0, 'Forced fallback left SVG refraction active.');
    await captureScreenshot('purchase-order-fallback-mobile', 390, 844);

    const concurrencyRequest = await createRequestThroughApi(productId, '1.000', `درخواست رقابت P08 ${suffix}`);
    await logout();
    await login(approverCredentials.email, approverCredentials.password);
    await switchToDefaultOrganization();
    expectStatus(await browserFetch(`/api/v1/purchase-requests/${concurrencyRequest.id}/approve`, 'POST', {}), 200, 'Approve P08 contention request');
    await logout();
    await login(editorCredentials.email, editorCredentials.password);
    await switchToDefaultOrganization();
    const raceLineId = concurrencyRequest.lines[0].id;
    const raceConversion = await browserFetch(`/api/v1/purchase-requests/${concurrencyRequest.id}/convert`, 'POST', {
        supplier_party_id: supplier.id,
        lines: [{ source_request_line_id: raceLineId, unit_price_rial: '100000' }],
    });
    expectStatus(raceConversion, 201, 'Create P08 contention order');
    const raceOrderId = raceConversion.body.data.id;
    const raceOrderLineId = raceConversion.body.data.lines[0].id;
    const secondaryUrl = await startSecondServer();
    lockProcess = spawn(phpPath, [
        path.join(projectRoot, 'scripts', 'Lock-P08PurchaseOrderForConcurrency.php'),
        String(organizationId), String(raceOrderId), String(raceOrderLineId),
    ], { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    await waitForLockWorker();
    const cookie = await sessionCookieHeader();
    const csrf = await cdp.evaluate(`document.querySelector('meta[name="csrf-token"]')?.content ?? ''`);
    const raceKeyA = uuid();
    const raceKeyB = uuid();
    const racePath = `/api/v1/purchase-orders/${raceOrderId}/lines/${raceOrderLineId}/receipts`;
    let settled = 0;
    const competing = [baseUrl, secondaryUrl].map((url, index) => requestWithSession(
        url, cookie, csrf, racePath, { warehouse_id: warehouseId, location_id: locationId, quantity: '1.000' }, index === 0 ? raceKeyA : raceKeyB,
    ).finally(() => { settled += 1; }));
    await delay(300);
    assert.equal(settled, 0, 'Concurrent receipt requests did not wait for the order/line lock.');
    const raceResponses = await Promise.all(competing);
    const lockExit = await new Promise((resolve, reject) => {
        if (lockProcess.exitCode !== null) return resolve(lockProcess.exitCode);
        lockProcess.once('exit', resolve);
        lockProcess.once('error', reject);
    });
    assert.equal(lockExit, 0, `Order lock worker exited ${lockExit}.`);
    lockProcess = null;
    assert.deepEqual(raceResponses.map((item) => item.status).sort(), [201, 409], 'One P08 receipt should win and the other should observe the closed line.');
    const raceReadback = await browserFetch(`/api/v1/purchase-orders/${raceOrderId}`);
    expectStatus(raceReadback, 200, 'Read P08 contention order');
    assert.equal(raceReadback.body.data.lines[0].received_quantity, '1.000');
    assert.equal(raceReadback.body.data.lines[0].receipts.length, 1);

    assert.equal(browserErrors.length, 0, `Chrome reported runtime or network errors: ${browserErrors.join('; ')}`);
    summary = {
        organizationId,
        productId,
        requestId,
        orderId,
        priceSnapshot: { unitPriceRial: orderPrice, lineTotalRial: converted.body.data.lines[0].line_total_rial, totalRial: converted.body.data.total_rial },
        canonicalReceipt: {
            ordered: '5.000',
            received: ['3.000', '2.000'],
            finalBalances: ['15.000', '4.000', '11.000'],
            closed: true,
            replayReceiptId: lastReceipt.id,
            operationId: lastReceipt.operation.id,
            movementId: lastReceipt.movement.id,
        },
        concurrency: { statuses: raceResponses.map((item) => item.status), savedReceipts: raceReadback.body.data.lines[0].receipts.length },
        keyboard: { requestQuantityTabFocus: true, receiptButtonVisibleFocus: true },
        mobileMetrics,
        forcedFallback: fallback,
        screenshots,
        runtimeErrors: browserErrors.length,
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
    runFailure = error;
    throw error;
} finally {
    if (lockProcess) await stopProcess(lockProcess);
    await stopProcess(secondServer);
    cdp?.close();
    await stopChromeTree(browserProcess);
    if (resolvedProfile.startsWith(`${profileRoot}${path.sep}`)) {
        let removed = false;
        for (let attempt = 0; attempt < 8 && !removed; attempt += 1) {
            try {
                await rm(resolvedProfile, { recursive: true, force: true });
                removed = true;
            } catch (error) {
                if (attempt === 7) {
                    const warning = `Could not remove temporary Chrome profile ${resolvedProfile}: ${error.message}`;
                    if (runFailure) process.stderr.write(`${warning}\n`);
                    else throw error;
                } else {
                    await delay(250 * (attempt + 1));
                }
            }
        }
    }
}
