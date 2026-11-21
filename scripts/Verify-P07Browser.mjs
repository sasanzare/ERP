import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.P07_BROWSER_BASE_URL ?? 'http://127.0.0.1:8000';
const browserPath = process.env.P07_BROWSER_EXECUTABLE ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const phpPath = process.env.ERP_PHP_BINARY ?? 'C:\\php8.5\\php.exe';
const credentialsPath = path.join(projectRoot, 'storage', 'app', 'private', 'p03-demo-credentials.json');
const screenshotDirectory = path.join(projectRoot, 'docs', 'screenshots');
const profileRoot = path.resolve(projectRoot, 'storage', 'framework', 'testing');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const suffix = Date.now().toString(36).toUpperCase();
const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
assert.ok(credentials.editor?.email && credentials.editor?.password, 'Local editor credentials are unavailable.');
await access(browserPath);
await access(phpPath);
await mkdir(profileRoot, { recursive: true });
await mkdir(screenshotDirectory, { recursive: true });

const profileDirectory = await mkdtemp(path.join(profileRoot, 'p07-browser-'));
const resolvedProfile = path.resolve(profileDirectory);
assert.ok(resolvedProfile.startsWith(`${profileRoot}${path.sep}`), 'Browser profile escaped the ignored test directory.');

let browserProcess;
let secondServer;
let lockProcess;
let cdp;
const browserErrors = [];
const screenshots = [];
const fixtureSummaries = [];

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
    const snapshot = await cdp.evaluate(`({ path: location.pathname, body: document.body?.innerText?.slice(0, 400) ?? '' })`);
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
    await delay(350);
    const image = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    const filename = `p07-${name}-${timestamp}.png`;
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
    assert.equal(changed, true, `The editor organization ${name} was not available in the workspace selector.`);
    const workspace = await waitUntil('editor organization switch', () => `(async () => {
        const response = await fetch('/api/v1/workspace', { credentials: 'include', headers: { Accept: 'application/json' } });
        if (!response.ok) return null;
        const value = await response.json();
        return value.active_organization?.name === ${JSON.stringify(name)} ? value : null;
    })()`);
    assert.equal(workspace.active_organization.name, name);
    return workspace;
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

async function stopProcess(process) {
    if (!process || process.exitCode !== null) return;
    process.kill();
    await Promise.race([new Promise((resolve) => process.once('exit', resolve)), delay(5000)]);
}

function idempotencyKey() { return crypto.randomUUID(); }

function expectStatus(response, expected, action) {
    assert.equal(response.status, expected, `${action} returned ${response.status}: ${JSON.stringify(response.body)}`);
}

async function createFixture(kind) {
    const options = await browserFetch('/api/v1/sales/options');
    expectStatus(options, 200, 'Read sales options');
    const customer = options.body.data.customers[0];
    const priceList = options.body.data.price_lists.find((item) => item.code === 'P05-QUOTE') ?? options.body.data.price_lists[0];
    const unit = options.body.data.products.find((item) => item.base_unit !== null)?.base_unit;
    assert.ok(customer && priceList && unit, 'A synthetic customer, price list, or base unit is missing.');

    const code = `P07-${kind}-${suffix}`;
    const productResponse = await browserFetch('/api/v1/products', 'POST', {
        code: `${code}-P`, name: `کالای پذیرش P07 ${kind}`, base_unit_id: unit.id,
    });
    expectStatus(productResponse, 201, 'Create synthetic P07 product');
    const productId = productResponse.body.data.id;
    expectStatus(await browserFetch(`/api/v1/price-lists/${priceList.id}/entries`, 'POST', {
        product_id: productId, amount_rial: '1000000',
    }), 201, 'Add synthetic P07 price');

    const warehouseResponse = await browserFetch('/api/v1/warehouses', 'POST', {
        code: `${code}-WH`, name: `انبار P07 ${kind} ${suffix}`,
    });
    expectStatus(warehouseResponse, 201, 'Create synthetic P07 warehouse');
    const warehouseId = warehouseResponse.body.data.id;
    const locationResponse = await browserFetch('/api/v1/locations', 'POST', {
        warehouse_id: warehouseId, code: `${code}-LOC`, name: `مکان P07 ${kind} ${suffix}`,
    });
    expectStatus(locationResponse, 201, 'Create synthetic P07 location');
    const locationId = locationResponse.body.data.id;

    const leadResponse = await browserFetch('/api/v1/leads', 'POST', {
        title: `پذیرش تکمیل سفارش P07 ${kind} ${suffix}`, party_id: customer.id,
    });
    expectStatus(leadResponse, 201, 'Create synthetic P07 lead');
    const quoteResponse = await browserFetch(`/api/v1/leads/${leadResponse.body.data.id}/quotes`, 'POST', { price_list_id: priceList.id });
    expectStatus(quoteResponse, 201, 'Create synthetic P07 quote');
    const quoteId = quoteResponse.body.data.id;
    expectStatus(await browserFetch(`/api/v1/quotes/${quoteId}/lines`, 'POST', {
        product_id: productId, quantity: '3.000', discount: '0.00',
    }), 201, 'Add the 3.000-unit P07 order line');
    expectStatus(await browserFetch(`/api/v1/quotes/${quoteId}/confirm`, 'POST', {}), 200, 'Confirm synthetic P07 quote');
    const orderResponse = await browserFetch(`/api/v1/quotes/${quoteId}/convert`, 'POST', {});
    expectStatus(orderResponse, 201, 'Convert synthetic P07 quote');
    const orderId = orderResponse.body.data.id;
    const opening = await browserFetch('/api/v1/stock/operations', 'POST', {
        operation_type: 'opening', product_id: productId, quantity: '10.000',
        warehouse_id: warehouseId, location_id: locationId,
    }, { 'Idempotency-Key': idempotencyKey() });
    expectStatus(opening, 201, 'Open 10.000 units for P07');

    const fixture = { kind, productId, warehouseId, locationId, lineId: orderResponse.body.data.lines[0].id, orderId, operationId: opening.body.data.id };
    fixtureSummaries.push(fixture);
    return fixture;
}

function balanceFor(rows, fixture) {
    return rows.find((row) => row.product.id === fixture.productId && row.location.id === fixture.locationId);
}

async function readBalance(fixture) {
    const response = await browserFetch('/api/v1/stock/balances');
    expectStatus(response, 200, 'Read stock balances');
    const row = balanceFor(response.body.data, fixture);
    assert.ok(row, `Balance was not found for the ${fixture.kind} fixture.`);
    return [row.physical_quantity, row.reserved_quantity, row.available_quantity];
}

async function reserveThroughUi(fixture) {
    await setSelect(`#fulfillment-warehouse-${fixture.lineId}`, fixture.warehouseId);
    await setSelect(`#fulfillment-location-${fixture.lineId}`, fixture.locationId);
    await setInput(`#fulfillment-quantity-${fixture.lineId}`, '3.000');

    await cdp.evaluate(`document.querySelector('#fulfillment-quantity-${fixture.lineId}')?.focus()`);
    await pressKey('Tab');
    const focusedWarehouse = await cdp.evaluate(`document.activeElement?.id ?? ''`);
    assert.equal(focusedWarehouse, `fulfillment-warehouse-${fixture.lineId}`, 'Keyboard Tab did not reach the warehouse selector.');
    await pressKey('Tab');
    const focusedLocation = await cdp.evaluate(`document.activeElement?.id ?? ''`);
    assert.equal(focusedLocation, `fulfillment-location-${fixture.lineId}`, 'Keyboard Tab did not reach the location selector.');
    await pressKey('Tab');
    const focusState = await cdp.evaluate(`({ id: document.activeElement?.id ?? '', outline: getComputedStyle(document.activeElement).outlineWidth, visible: document.activeElement?.matches(':focus-visible') ?? false })`);
    assert.ok(focusState.visible && focusState.outline !== '0px', 'The focused reserve action lacks a visible keyboard indicator.');
    await submitForm(`form[aria-label="رزرو برای کالای پذیرش P07 ${fixture.kind}"]`);
}

async function requestDelivery(url, cookieHeader, csrf, fixture, reservationId, quantity, key) {
    const response = await fetch(`${url}/api/v1/sales-orders/${fixture.orderId}/lines/${fixture.lineId}/deliveries`, {
        method: 'POST',
        headers: {
            Accept: 'application/json', 'Content-Type': 'application/json', Cookie: cookieHeader,
            'X-CSRF-TOKEN': csrf, 'Idempotency-Key': key,
        },
        body: JSON.stringify({ reservation_id: reservationId, quantity }),
    });
    return { status: response.status, body: await response.json() };
}

let summary;
try {
    await startBrowser();
    await login(credentials.editor.email, credentials.editor.password);
    const initialWorkspace = await browserFetch('/api/v1/workspace');
    expectStatus(initialWorkspace, 200, 'Read workspace memberships');
    const editorOrganization = initialWorkspace.body.organizations.find((item) => item.role === 'editor');
    assert.ok(editorOrganization, 'The local editor membership is unavailable.');
    await changeOrganizationByUi(editorOrganization.name);
    const mainFixture = await createFixture('MAIN');
    await navigate(`/orders/${mainFixture.orderId}`);
    await waitUntil('P07 order line and fulfillment controls', () => `Boolean(document.querySelector('[data-testid="order-line-${mainFixture.lineId}"] .fulfillment-reserve-form'))`);

    assert.deepEqual(await readBalance(mainFixture), ['10.000', '0.000', '10.000']);
    await reserveThroughUi(mainFixture);
    await waitUntil('order reservation refresh', () => `document.querySelector('[data-testid="order-line-${mainFixture.lineId}"]')?.innerText.includes('3.000') && document.querySelectorAll('.fulfillment-history li').length > 0`);
    const afterReserve = await browserFetch(`/api/v1/sales-orders/${mainFixture.orderId}`);
    expectStatus(afterReserve, 200, 'Read P07 order after reservation');
    const reservedLine = afterReserve.body.data.lines[0];
    assert.deepEqual([
        reservedLine.fulfillment.ordered_quantity, reservedLine.fulfillment.reserved_quantity,
        reservedLine.fulfillment.delivered_quantity, reservedLine.fulfillment.cancelled_quantity,
        reservedLine.fulfillment.pending_quantity,
    ], ['3.000', '3.000', '0.000', '0.000', '3.000']);
    assert.deepEqual(await readBalance(mainFixture), ['10.000', '3.000', '7.000']);
    const reservationId = reservedLine.fulfillment.reservations[0].id;

    await cdp.evaluate(`document.querySelector('.fulfillment-section')?.scrollIntoView({ block: 'center' })`);
    await captureScreenshot('reserve-desktop', 1280, 900);
    await setInput(`#delivery-quantity-${mainFixture.lineId}-${reservationId}`, '2.000');
    await click('.fulfillment-delivery-form .glass-button');
    await waitUntil('recorded P07 delivery', () => `document.querySelector('[data-testid="order-line-${mainFixture.lineId}"]')?.innerText.includes('حرکت خروجی')`);
    let order = await browserFetch(`/api/v1/sales-orders/${mainFixture.orderId}`);
    expectStatus(order, 200, 'Read P07 order after delivery');
    let line = order.body.data.lines[0];
    assert.deepEqual([
        line.fulfillment.ordered_quantity, line.fulfillment.reserved_quantity,
        line.fulfillment.delivered_quantity, line.fulfillment.cancelled_quantity,
        line.fulfillment.pending_quantity,
    ], ['3.000', '1.000', '2.000', '0.000', '1.000']);
    assert.equal(line.fulfillment.deliveries.length, 1);
    const delivery = line.fulfillment.deliveries[0];
    assert.equal(delivery.operation.operation_type, 'issue');
    assert.equal(delivery.movement.direction, 'outbound');
    assert.equal(delivery.movement.quantity, '2.000');
    assert.deepEqual(await readBalance(mainFixture), ['8.000', '1.000', '7.000']);
    await cdp.evaluate(`document.querySelector('.fulfillment-section')?.scrollIntoView({ block: 'center' })`);
    await captureScreenshot('delivery-desktop', 1280, 900);

    const csrf = await cdp.evaluate(`document.querySelector('meta[name="csrf-token"]')?.content ?? ''`);
    const cookieHeader = await sessionCookieHeader();
    await click('.fulfillment-cancel');
    await waitUntil('cancelled P07 remainder', () => `document.querySelector('[data-testid="order-line-${mainFixture.lineId}"]')?.innerText.includes('لغو شد')`);
    order = await browserFetch(`/api/v1/sales-orders/${mainFixture.orderId}`);
    expectStatus(order, 200, 'Read P07 order after cancellation');
    line = order.body.data.lines[0];
    assert.deepEqual([
        line.fulfillment.ordered_quantity, line.fulfillment.reserved_quantity,
        line.fulfillment.delivered_quantity, line.fulfillment.cancelled_quantity,
        line.fulfillment.pending_quantity,
    ], ['3.000', '0.000', '2.000', '1.000', '0.000']);
    assert.deepEqual(await readBalance(mainFixture), ['8.000', '0.000', '8.000']);
    const cancelAgain = await browserFetch(`/api/v1/sales-orders/${mainFixture.orderId}/lines/${mainFixture.lineId}/cancel-remainder`, 'POST', {});
    expectStatus(cancelAgain, 200, 'Retry P07 remainder cancellation');
    assert.equal(cancelAgain.body.already_cancelled, true);
    assert.equal(cancelAgain.body.data.lines[0].fulfillment.cancelled_at, line.fulfillment.cancelled_at);
    assert.equal((await browserFetch('/api/v1/stock/movements')).body.data.filter((item) => item.product.id === mainFixture.productId).length, 2);

    await cdp.evaluate(`document.querySelector('.fulfillment-section')?.scrollIntoView({ block: 'center' })`);
    await captureScreenshot('cancel-desktop', 1280, 900);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await cdp.evaluate(`document.querySelector('.fulfillment-section')?.scrollIntoView({ block: 'center' })`);
    const mobileMetrics = await cdp.evaluate(`({ innerWidth: window.innerWidth, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, stage: document.querySelector('[data-lg-role="stage"]')?.getBoundingClientRect().width ?? null })`);
    assert.equal(mobileMetrics.scrollWidth, mobileMetrics.clientWidth, 'The mobile sales-order detail has horizontal overflow.');
    await captureScreenshot('order-mobile', 390, 844);
    await navigate(`/orders/${mainFixture.orderId}?glass=fallback&scene=bright`);
    await waitUntil('forced glass fallback order detail', () => `Boolean(document.querySelector('[data-testid="order-line-${mainFixture.lineId}"]'))`);
    await cdp.evaluate(`document.querySelector('.fulfillment-section')?.scrollIntoView({ block: 'center' })`);
    const fallback = await cdp.evaluate(`({ surfaces: document.querySelectorAll('.lg-surface').length, svgSurfaces: document.querySelectorAll('.lg-surface.lg-svg-ok').length })`);
    assert.ok(fallback.surfaces > 0, 'Forced fallback removed the shared glass controls.');
    assert.equal(fallback.svgSurfaces, 0, 'Forced fallback left SVG refraction active.');
    await captureScreenshot('fallback-mobile', 390, 844);

    const raceFixture = await createFixture('RACE');
    const raceReservationResponse = await browserFetch(`/api/v1/sales-orders/${raceFixture.orderId}/lines/${raceFixture.lineId}/reservations`, 'POST', {
        quantity: '3.000', warehouse_id: raceFixture.warehouseId, location_id: raceFixture.locationId,
    }, { 'Idempotency-Key': idempotencyKey() });
    expectStatus(raceReservationResponse, 201, 'Reserve the contention fixture');
    const raceReservationId = raceReservationResponse.body.data.lines[0].fulfillment.reservations[0].id;
    const secondaryUrl = await startSecondServer();
    const raceKey = idempotencyKey();
    lockProcess = spawn(phpPath, [
        path.join(projectRoot, 'scripts', 'Lock-P06StockForConcurrency.php'),
        String((await browserFetch('/api/v1/workspace')).body.active_organization.id),
        String(raceFixture.productId), String(raceFixture.locationId),
    ], { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    await waitForLockWorker();
    let settled = 0;
    const competing = [baseUrl, secondaryUrl].map((url) => requestDelivery(
        url, cookieHeader, csrf, raceFixture, raceReservationId, '2.000', raceKey,
    ).finally(() => { settled += 1; }));
    await delay(300);
    assert.equal(settled, 0, 'Contending deliveries did not wait behind the MariaDB stock-key lock.');
    const raceResponses = await Promise.all(competing);
    const lockExitCode = await new Promise((resolve, reject) => {
        if (lockProcess.exitCode !== null) {
            resolve(lockProcess.exitCode);
            return;
        }
        lockProcess.once('exit', resolve);
        lockProcess.once('error', reject);
    });
    assert.equal(lockExitCode, 0, `Stock-key lock exited ${lockExitCode}.`);
    lockProcess = null;
    assert.deepEqual(raceResponses.map((item) => item.status).sort(), [200, 201], 'Contending retries did not return the same P07 issue.');
    const raceDeliveries = raceResponses.map((item) => item.body.data.lines[0].fulfillment.deliveries[0]);
    assert.equal(raceDeliveries[0].id, raceDeliveries[1].id, 'Contending retries returned different delivery rows.');
    assert.equal(raceDeliveries[0].operation.id, raceDeliveries[1].operation.id, 'Contending retries returned different inventory operations.');
    const changedPayload = await browserFetch(`/api/v1/sales-orders/${raceFixture.orderId}/lines/${raceFixture.lineId}/deliveries`, 'POST', {
        reservation_id: raceReservationId, quantity: '1.999',
    }, { 'Idempotency-Key': raceKey });
    expectStatus(changedPayload, 409, 'Reject reused delivery key with changed payload');
    const excessDelivery = await browserFetch(`/api/v1/sales-orders/${raceFixture.orderId}/lines/${raceFixture.lineId}/deliveries`, 'POST', {
        reservation_id: raceReservationId, quantity: '2.000',
    }, { 'Idempotency-Key': idempotencyKey() });
    expectStatus(excessDelivery, 422, 'Reject a delivery above the remaining line and reservation quantities');
    order = await browserFetch(`/api/v1/sales-orders/${raceFixture.orderId}`);
    expectStatus(order, 200, 'Read the contention order');
    assert.equal(order.body.data.lines[0].fulfillment.deliveries.length, 1);
    assert.deepEqual(await readBalance(raceFixture), ['8.000', '1.000', '7.000']);
    const raceCancel = await browserFetch(`/api/v1/sales-orders/${raceFixture.orderId}/lines/${raceFixture.lineId}/cancel-remainder`, 'POST', {});
    expectStatus(raceCancel, 200, 'Cancel the remaining contention fixture quantity');
    assert.deepEqual(await readBalance(raceFixture), ['8.000', '0.000', '8.000']);

    assert.equal(browserErrors.length, 0, `Chrome reported runtime or network errors: ${browserErrors.join('; ')}`);
    summary = {
        mainFixture,
        canonicalBalances: {
            afterOpen: ['10.000', '0.000', '10.000'],
            afterReserve: ['10.000', '3.000', '7.000'],
            afterDelivery: ['8.000', '1.000', '7.000'],
            afterCancel: ['8.000', '0.000', '8.000'],
        },
        delivery: { id: delivery.id, operationId: delivery.operation.id, movementId: delivery.movement.id, quantity: delivery.quantity },
        retry: { repeatCancellation: cancelAgain.body.already_cancelled, changedIdempotencyPayload: 409 },
        concurrency: { statuses: raceResponses.map((item) => item.status), oneDeliveryId: raceDeliveries[0].id, finalBalances: ['8.000', '0.000', '8.000'] },
        mobileMetrics,
        forcedFallback: fallback,
        keyboard: { warehouseTab: true, locationTab: true, visibleFocus: true },
        screenshots,
        runtimeErrors: browserErrors.length,
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} finally {
    if (lockProcess) await stopProcess(lockProcess);
    await stopProcess(secondServer);
    try { await cdp?.send('Browser.close', {}, 10000); } catch { /* Chrome may already be closing after an assertion failure. */ }
    cdp?.close();
    await stopProcess(browserProcess);
    if (resolvedProfile.startsWith(`${profileRoot}${path.sep}`)) await rm(resolvedProfile, { recursive: true, force: true });
}
