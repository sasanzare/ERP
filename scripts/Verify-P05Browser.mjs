import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.P05_BROWSER_BASE_URL ?? 'http://127.0.0.1:8000';
const browserPath = process.env.P05_BROWSER_EXECUTABLE ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const phpPath = process.env.ERP_PHP_BINARY ?? 'C:\\php8.5\\php.exe';
const credentialsPath = path.join(projectRoot, 'storage', 'app', 'private', 'p03-demo-credentials.json');
const screenshotDirectory = path.join(projectRoot, 'docs', 'screenshots');
const profileRoot = path.resolve(projectRoot, 'storage', 'framework', 'testing');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const leadTitle = `P05 browser lead ${timestamp}`;
const activityTitle = `P05 browser follow-up ${timestamp}`;
const activityDueLocal = (() => {
    const value = new Date(Date.now() - 2 * 60 * 60 * 1000);
    return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
})();
const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
assert.ok(credentials.editor?.email && credentials.editor?.password, 'Local editor credentials are unavailable.');
assert.ok(credentials.reader?.email && credentials.reader?.password, 'Local reader credentials are unavailable.');
await access(browserPath);
await access(phpPath);
await mkdir(profileRoot, { recursive: true });
await mkdir(screenshotDirectory, { recursive: true });

const profileDirectory = await mkdtemp(path.join(profileRoot, 'p05-browser-'));
const resolvedProfile = path.resolve(profileDirectory);
assert.ok(resolvedProfile.startsWith(`${profileRoot}${path.sep}`), 'Browser profile escaped the ignored test directory.');

let browserProcess;
let cdp;
let secondServer;
let lockProcess;
let editorAuthenticated = false;
let readerAuthenticated = false;
let priceListId = null;
let priceProductId = null;
let originalPriceRial = null;
let priceWasChanged = false;
let quoteId = null;
let orderId = null;
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
        const result = await cdp.evaluate(predicate());
        if (result) return result;
        await delay(100);
    }
    const snapshot = await cdp.evaluate(`({ path: location.pathname, body: document.body?.innerText?.slice(0, 260) ?? '' })`);
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

function withFallback(pathname, glass = false) {
    const url = new URL(pathname, baseUrl);
    if (glass) { url.searchParams.set('glass', 'fallback'); url.searchParams.set('scene', 'bright'); }
    return `${url.pathname}${url.search}`;
}

async function navigate(pathname) {
    const priorLoadEvents = cdp.loadEvents;
    const result = await cdp.send('Page.navigate', { url: new URL(pathname, baseUrl).href });
    assert.ok(result.errorText === undefined || result.errorText === 'net::ERR_ABORTED', 'Chrome navigation failed.');
    await waitForPageLoad(priorLoadEvents);
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
    assert.equal(changed, true, `Required field was not found: ${selector}`);
    await delay(60);
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
    assert.equal(changed, true, `Required selector was not found: ${selector}`);
    await delay(60);
}

async function submitForm(selector) {
    const submitted = await cdp.evaluate(`(() => { const form = document.querySelector(${JSON.stringify(selector)}); if (!form) return false; form.requestSubmit(); return true; })()`);
    assert.equal(submitted, true, `Required form was not found: ${selector}`);
}

async function click(selector) {
    const clicked = await cdp.evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; element.click(); return true; })()`);
    assert.equal(clicked, true, `Required control was not found: ${selector}`);
}

async function clickButtonContaining(text) {
    const clicked = await cdp.evaluate(`(() => {
        const button = [...document.querySelectorAll('button')].find((item) => item.innerText.includes(${JSON.stringify(text)}));
        if (!button) return false;
        button.click(); return true;
    })()`);
    assert.equal(clicked, true, `Required button was not found: ${text}`);
}

async function pressKey(key, code, keyCode) {
    const params = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode };
    if (key === 'Enter') {
        await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...params });
        await cdp.send('Input.dispatchKeyEvent', { type: 'char', ...params, text: '\r', unmodifiedText: '\r' });
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
        return;
    }
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}

async function browserFetch(pathname, method = 'GET', body = undefined) {
    const csrf = method === 'GET' ? '' : await cdp.evaluate(`document.querySelector('meta[name="csrf-token"]')?.content ?? ''`);
    const options = {
        method,
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...(csrf ? { 'X-CSRF-TOKEN': csrf } : {}),
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
    await delay(250);
    const image = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    const filename = `p05-${name}-${timestamp}.png`;
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
    await waitUntil('workspace account controls', () => `Boolean(document.querySelector('.workspace-account-bar'))`);
    await waitUntil('workspace organization context', () => `Boolean(document.querySelector('select[aria-label="انتخاب سازمان فعال"]') || document.querySelector('.organization-picker strong'))`);
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
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
}

async function startSecondServer() {
    const primary = new URL(baseUrl);
    const port = Number(primary.port || 80) + 1;
    const secondary = `${primary.protocol}//${primary.hostname}:${port}`;
    secondServer = spawn(phpPath, ['artisan', 'serve', '--host=127.0.0.1', `--port=${port}`], {
        cwd: projectRoot, stdio: 'ignore', windowsHide: true,
    });
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        if (secondServer.exitCode !== null) throw new Error(`Second local PHP server exited with code ${secondServer.exitCode}.`);
        try {
            const response = await fetch(`${secondary}/sign-in`);
            if (response.status === 200) return secondary;
        } catch { /* Wait for the local server to bind. */ }
        await delay(100);
    }
    throw new Error('Second local PHP server did not become ready for the MariaDB contention check.');
}

async function cookiesForLocalSession() {
    const result = await cdp.send('Network.getAllCookies');
    const cookies = (result.cookies ?? []).filter((cookie) => cookie.domain.includes('127.0.0.1'));
    assert.ok(cookies.some((cookie) => cookie.name.toLowerCase().includes('session')), `Chrome did not retain the local Laravel session cookie: ${JSON.stringify(cookies.map(({ name, domain, path }) => ({ name, domain, path })))}`);
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

async function waitForLockWorker() {
    return new Promise((resolve, reject) => {
        let output = '';
        let errors = '';
        const timer = setTimeout(() => reject(new Error(`MariaDB quote lock did not start: ${errors}`)), 10000);
        lockProcess.stdout.on('data', (chunk) => {
            output += String(chunk);
            if (output.includes('LOCKED')) { clearTimeout(timer); resolve(); }
        });
        lockProcess.stderr.on('data', (chunk) => { errors += String(chunk); });
        lockProcess.on('exit', (code) => {
            if (code !== 0 && !output.includes('LOCKED')) { clearTimeout(timer); reject(new Error(`MariaDB quote lock exited ${code}: ${errors}`)); }
        });
    });
}

async function requestConversion(url, cookieHeader, csrf, id) {
    const response = await fetch(`${url}/api/v1/quotes/${id}/convert`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Cookie: cookieHeader, 'X-CSRF-TOKEN': csrf },
        body: '{}',
    });
    return { status: response.status, body: await response.json() };
}

async function stopProcess(process) {
    if (!process || process.exitCode !== null) return;
    process.kill();
    await Promise.race([new Promise((resolve) => process.once('exit', resolve)), delay(5000)]);
}

async function waitForProcessExit(process) {
    if (!process || process.exitCode !== null) return;
    await new Promise((resolve) => process.once('exit', resolve));
}

async function restoreP05Price() {
    if (!priceWasChanged || originalPriceRial === null || priceListId === null || priceProductId === null || !cdp) return;
    if (!editorAuthenticated) {
        if (readerAuthenticated) {
            await click('.sign-out-button');
            await waitUntil('reader sign-out for fixture restoration', () => `location.pathname === '/sign-in'`);
            readerAuthenticated = false;
        }
        await login(credentials.editor.email, credentials.editor.password);
        editorAuthenticated = true;
    }
    const restored = await browserFetch(`/api/v1/price-lists/${priceListId}/entries`, 'POST', {
        product_id: priceProductId, amount_rial: originalPriceRial,
    });
    assert.equal(restored.status, 201, 'P05 demo price-list entry could not be restored.');
    priceWasChanged = false;
}

let summary;
try {
    await startBrowser();
    await navigate('/leads');
    assert.equal(await cdp.evaluate('location.pathname'), '/sign-in', 'Guest lead navigation did not redirect to sign-in.');
    await login(credentials.editor.email, credentials.editor.password);
    editorAuthenticated = true;
    await changeOrganizationByUi('سازمان پیش‌فرض');
    const cookieHeader = await cookiesForLocalSession();

    const optionsResponse = await browserFetch('/api/v1/sales/options');
    assert.equal(optionsResponse.status, 200, 'Sales selectors did not load for the active organization.');
    const customer = optionsResponse.body.data.customers.find((item) => item.code === 'DEMO-PARTY-001');
    const priceList = optionsResponse.body.data.price_lists.find((item) => item.code === 'P05-QUOTE');
    const firstProduct = optionsResponse.body.data.products.find((item) => item.code === 'P05-DEMO-001');
    const secondProduct = optionsResponse.body.data.products.find((item) => item.code === 'P05-DEMO-002');
    assert.ok(customer && priceList && firstProduct?.base_unit && secondProduct?.base_unit, 'P05 demo customer, price list, or known-unit products are missing.');
    priceListId = priceList.id;
    priceProductId = firstProduct.id;
    const firstPrice = await browserFetch(`/api/v1/price-lists/${priceList.id}/products/${firstProduct.id}`);
    assert.equal(firstPrice.status, 200);
    originalPriceRial = firstPrice.body.data.amount_rial;
    assert.equal(originalPriceRial, '1200000', 'P05 fixture should resolve to 120,000.0 toman from 1,200,000 rial.');

    await navigate('/leads');
    await waitUntil('editor lead create action', () => `Boolean(document.querySelector('a[href^="/leads/new"]'))`);
    await click('a[href^="/leads/new"]');
    await waitUntil('new lead form', () => `Boolean(document.querySelector('[aria-label="عنوان سرنخ"]'))`);
    await setInput('[aria-label="عنوان سرنخ"]', leadTitle);
    await setSelect('[aria-label="مشتری سرنخ"]', customer.id);
    await cdp.evaluate(`document.querySelector('[aria-label="عنوان سرنخ"]')?.focus()`);
    await pressKey('Tab', 'Tab', 9);
    assert.equal(await cdp.evaluate(`document.activeElement?.getAttribute('aria-label')`), 'مشتری سرنخ', 'Tab did not move focus to the customer selector.');
    await pressKey('Tab', 'Tab', 9);
    assert.equal(await cdp.evaluate(`document.activeElement?.getAttribute('type')`), 'submit', 'Tab did not reach the lead submit control.');
    const focusStyle = await cdp.evaluate(`({ width: getComputedStyle(document.activeElement).outlineWidth, style: getComputedStyle(document.activeElement).outlineStyle })`);
    assert.ok(focusStyle.style !== 'none' && Number.parseFloat(focusStyle.width) > 0, 'Keyboard focus ring is not visible on the lead submit control.');
    await pressKey('Enter', 'Enter', 13);
    await waitUntil('created lead detail', () => `location.pathname.startsWith('/leads/') && /\\/leads\\/\\d+$/.test(location.pathname)`);
    await waitUntil('lead follow-up form', () => `Boolean(document.querySelector('[aria-label="عنوان پیگیری"]'))`);
    const leadId = Number((await cdp.evaluate('location.pathname')).split('/').at(-1));
    const createdLead = await browserFetch(`/api/v1/leads/${leadId}`);
    assert.equal(createdLead.status, 200);
    assert.equal(createdLead.body.data.customer.id, customer.id);

    await setInput('[aria-label="عنوان پیگیری"]', activityTitle);
    await setInput('[aria-label="زمان سررسید"]', activityDueLocal);
    await submitForm('.sales-activity-form');
    await waitUntil('activity recorded on lead', () => `document.body.innerText.includes(${JSON.stringify(activityTitle)})`);
    const leadWithActivity = await browserFetch(`/api/v1/leads/${leadId}`);
    const activity = leadWithActivity.body.data.activities.find((item) => item.title === activityTitle);
    assert.ok(activity && activity.is_overdue && activity.completed_at === null, 'The newly-dated activity was not overdue and open.');

    await navigate('/follow-ups');
    await waitUntil('overdue follow-up queue', () => `document.body.innerText.includes(${JSON.stringify(activityTitle)})`);
    await captureScreenshot('overdue-follow-up-desktop', 1280, 900);
    const completedClick = await cdp.evaluate(`(() => {
        const card = [...document.querySelectorAll('.sales-card')].find((item) => item.innerText.includes(${JSON.stringify(activityTitle)}));
        const button = card?.querySelector('button'); if (!button) return false; button.click(); return true;
    })()`);
    assert.equal(completedClick, true, 'Overdue activity completion action was not available.');
    await waitUntil('completed activity removed from refreshed queue', () => `!document.body.innerText.includes(${JSON.stringify(activityTitle)})`);
    await navigate('/follow-ups');
    await waitUntil('reloaded overdue queue', () => `Boolean(document.querySelector('[data-lg-role="focus"]'))`);
    assert.equal(await cdp.evaluate(`document.body.innerText.includes(${JSON.stringify(activityTitle)})`), false, 'Completed activity remained in the overdue-open queue after reload.');
    const completedActivity = await browserFetch(`/api/v1/lead-activities/${activity.id}`);
    assert.equal(completedActivity.body.data.completed_at === null, false, 'Completion timestamp was not persisted.');

    await navigate(`/leads/${leadId}`);
    await waitUntil('lead quote creation action', () => `Boolean(document.querySelector('a[href^="/quotes/new"]'))`);
    await click('a[href^="/quotes/new"]');
    await waitUntil('new quote form', () => `Boolean(document.querySelector('[aria-label="فهرست قیمت"]'))`);
    await setSelect('[aria-label="فهرست قیمت"]', priceList.id);
    await submitForm('form[aria-label="ساخت پیش‌نویس پیش‌فاکتور"]');
    await waitUntil('draft quote detail', () => `location.pathname.startsWith('/quotes/') && /\\/quotes\\/\\d+$/.test(location.pathname)`);
    quoteId = Number((await cdp.evaluate('location.pathname')).split('/').at(-1));

    async function addLine(product, quantity, discount) {
        await waitUntil('quote line form', () => `Boolean(document.querySelector('.sales-add-line-form'))`);
        await setSelect('[aria-label="کالای سطر"]', product.id);
        await setInput('[aria-label="مقدار سطر تازه"]', quantity);
        await setInput('[aria-label="تخفیف سطر تازه"]', discount);
        await submitForm('.sales-add-line-form');
    }

    await addLine(firstProduct, '1.250', '10.00');
    await waitUntil('first line snapshot', () => `document.body.innerText.includes('۱۳۵٬۰۰۰')`);
    await addLine(secondProduct, '0.333', '2.50');
    await waitUntil('two quote lines and exact Toman total', () => `document.querySelectorAll('.sales-line-card').length === 2 && document.body.innerText.includes('۱۷۸٬۸۳۱')`);
    let quote = await browserFetch(`/api/v1/quotes/${quoteId}`);
    assert.equal(quote.status, 200);
    assert.deepEqual(quote.body.data.lines.map((line) => line.line_net_toman), ['135000', '43831']);
    assert.equal(quote.body.data.total_toman, '178831');
    assert.equal(quote.body.data.lines[0].unit_price_toman, '120000.0');
    assert.equal(quote.body.data.lines[1].unit_price_toman, '135000.0');
    assert.ok((await cdp.evaluate(`document.querySelector('[data-lg-role="focus"]')?.innerText ?? ''`)).includes('تومان'), 'Quote totals were not labeled toman in the UI.');
    await captureScreenshot('quote-desktop', 1280, 900);
    await cdp.evaluate(`document.querySelector('.sales-line-list')?.scrollIntoView({ block: 'center' })`);
    await captureScreenshot('quote-lines-desktop', 1280, 900);

    await clickButtonContaining('تأیید پیش‌فاکتور');
    await waitUntil('confirmed quote', () => `document.body.innerText.includes('تأییدشده') && document.body.innerText.includes('تبدیل به سفارش تأییدشده')`);
    quote = await browserFetch(`/api/v1/quotes/${quoteId}`);
    assert.equal(quote.body.data.status, 'confirmed');

    const secondaryUrl = await startSecondServer();
    const csrf = await cdp.evaluate(`document.querySelector('meta[name="csrf-token"]')?.content ?? ''`);
    assert.ok(csrf, 'The local session did not expose its CSRF token.');
    lockProcess = spawn(phpPath, [path.join(projectRoot, 'scripts', 'Lock-P05QuoteForConcurrency.php'), String(quoteId)], {
        cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    await waitForLockWorker();
    let settled = 0;
    const conversions = [baseUrl, secondaryUrl].map((url) => requestConversion(url, cookieHeader, csrf, quoteId).finally(() => { settled += 1; }));
    await delay(300);
    assert.equal(settled, 0, 'Conversion requests did not wait behind the held MariaDB quote row lock.');
    const conversionResponses = await Promise.all(conversions);
    await waitForProcessExit(lockProcess);
    lockProcess = null;
    assert.deepEqual(conversionResponses.map((item) => item.status).sort(), [200, 201], 'Concurrent conversion did not create once and return the same existing order.');
    const convertedIds = conversionResponses.map((item) => item.body.data.id);
    assert.equal(convertedIds[0], convertedIds[1], 'Contending requests returned different sales orders.');
    orderId = convertedIds[0];
    assert.ok(conversionResponses.every((item) => item.body.data.lines.length === 2));
    const retry = await browserFetch(`/api/v1/quotes/${quoteId}/convert`, 'POST', {});
    assert.equal(retry.status, 200);
    assert.equal(retry.body.data.id, orderId);
    const orderList = await browserFetch('/api/v1/sales-orders');
    assert.equal(orderList.body.data.filter((item) => item.source_quote.id === quoteId).length, 1, 'More than one order exists for the source quote.');

    priceWasChanged = true;
    await browserFetch(`/api/v1/price-lists/${priceListId}/entries`, 'POST', { product_id: priceProductId, amount_rial: '9999990' }).then((result) => {
        assert.equal(result.status, 201, 'Authorized P04 price update failed.');
    });
    const changedPrice = await browserFetch(`/api/v1/price-lists/${priceListId}/products/${priceProductId}`);
    assert.equal(changedPrice.body.data.amount_rial, '9999990');
    await navigate(`/quotes/${quoteId}`);
    await waitUntil('reloaded quote price snapshot', () => `document.body.innerText.includes('۱۲۰٬۰۰۰') && document.body.innerText.includes('۱۷۸٬۸۳۱')`);
    quote = await browserFetch(`/api/v1/quotes/${quoteId}`);
    assert.equal(quote.body.data.lines[0].unit_price_toman, '120000.0');
    assert.equal(quote.body.data.total_toman, '178831');
    await navigate(`/orders/${orderId}`);
    await waitUntil('order detail with source links', () => `document.body.innerText.includes('پیش‌فاکتور مبدأ') && document.body.innerText.includes('مشتری')`);
    await captureScreenshot('order-desktop', 1280, 900);
    let order = await browserFetch(`/api/v1/sales-orders/${orderId}`);
    assert.equal(order.body.data.source_quote.id, quoteId);
    assert.equal(order.body.data.lead.id, leadId);
    assert.equal(order.body.data.customer.id, customer.id);
    assert.equal(order.body.data.lines.length, 2);
    assert.equal(order.body.data.lines[0].unit_price_toman, '120000.0');
    assert.equal(order.body.data.total_toman, '178831');
    await restoreP05Price();

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await delay(250);
    await cdp.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
    await delay(250);
    const mobileMetrics = await cdp.evaluate(`({
        width: window.innerWidth, height: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
        focusBottom: document.querySelector('[data-lg-role="focus"]')?.getBoundingClientRect().bottom ?? null,
        totalBottom: document.querySelector('.sales-total')?.getBoundingClientRect().bottom ?? null,
        dockTop: document.querySelector('.mobile-focus-dock')?.getBoundingClientRect().top ?? null,
    })`);
    assert.equal(mobileMetrics.width, 390);
    assert.equal(mobileMetrics.height, 844);
    assert.ok(mobileMetrics.documentWidth <= mobileMetrics.clientWidth + 1, `P05 mobile order has horizontal overflow: ${JSON.stringify(mobileMetrics)}`);
    assert.ok(mobileMetrics.dockTop > 0 && mobileMetrics.totalBottom < mobileMetrics.dockTop, `P05 order total overlaps the mobile dock: ${JSON.stringify(mobileMetrics)}`);
    await captureScreenshot('order-mobile', 390, 844);

    await navigate(withFallback(`/quotes/${quoteId}`, true));
    await waitUntil('forced bright glass fallback', () => `Boolean(document.querySelector('.sales-total'))`);
    await delay(250);
    const fallback = await cdp.evaluate(`({ surfaces: document.querySelectorAll('.lg-surface').length, svgSurfaces: document.querySelectorAll('.lg-surface.lg-svg-ok').length })`);
    assert.ok(fallback.surfaces > 0, 'Forced fallback removed the shared Liquid Glass controls.');
    assert.equal(fallback.svgSurfaces, 0, 'Forced fallback still enabled SVG refraction.');
    await cdp.evaluate(`document.querySelector('.sales-line-list')?.scrollIntoView({ block: 'center' })`);
    await captureScreenshot('quote-fallback-mobile', 390, 844);

    await click('.sign-out-button');
    await waitUntil('editor sign-out', () => `location.pathname === '/sign-in'`);
    editorAuthenticated = false;
    await login(credentials.reader.email, credentials.reader.password);
    readerAuthenticated = true;
    const readerWorkspace = await browserFetch('/api/v1/workspace');
    assert.equal(readerWorkspace.body.active_organization.role, 'reader');
    await navigate('/leads');
    assert.equal(await cdp.evaluate(`Boolean(document.querySelector('a[href^="/leads/new"]'))`), false, 'Reader saw the lead create route action.');
    const readerWrite = await browserFetch('/api/v1/leads', 'POST', { title: 'P05 reader write', party_id: customer.id });
    assert.equal(readerWrite.status, 403, 'Reader direct lead write was not forbidden.');
    const readerConfirm = await browserFetch(`/api/v1/quotes/${quoteId}/confirm`, 'POST', {});
    assert.equal(readerConfirm.status, 403, 'Reader direct quote write was not forbidden.');

    assert.deepEqual(browserErrors, [], 'Chrome reported JavaScript errors or failed browser requests.');
    summary = {
        browser: 'Google Chrome headless',
        viewportChecks: ['1280x900', '390x844', '390x844 forced bright fallback'],
        leadId, activityId: activity.id, activityRemovedFromReloadedQueue: true,
        quoteId, lineNetToman: quote.body.data.lines.map((line) => line.line_net_toman), totalToman: quote.body.data.total_toman,
        orderId, concurrentConversions: conversionResponses.map((item) => item.status), oneOrderForSourceQuote: true,
        priceListChangedAndRestored: true, quoteOrderSnapshotsStable: true,
        mobileMetrics, fallback, readerWrite: readerWrite.status, readerConfirm: readerConfirm.status,
        keyboardFocus: { tabSequence: true, enterSubmit: true, outline: focusStyle },
        screenshots, runtimeErrors: browserErrors.length,
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} finally {
    try { await restoreP05Price(); }
    catch (error) { process.stderr.write(`P05 demo price restoration failed: ${error instanceof Error ? error.message : 'unknown error'}\n`); }
    if (lockProcess) await stopProcess(lockProcess);
    await stopProcess(secondServer);
    try { await cdp?.send('Browser.close', {}, 10000); } catch { /* Browser may already be closing after an assertion failure. */ }
    cdp?.close();
    await stopProcess(browserProcess);
    await delay(300);
    await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
}
