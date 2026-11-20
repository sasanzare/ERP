import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.P03_BROWSER_BASE_URL ?? 'http://127.0.0.1:8000';
const browserPath = process.env.P03_BROWSER_EXECUTABLE
    ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const credentialsPath = path.join(projectRoot, 'storage', 'app', 'private', 'p03-demo-credentials.json');
const screenshotDirectory = path.join(projectRoot, 'docs', 'screenshots');
const profileRoot = path.resolve(projectRoot, 'storage', 'framework', 'testing');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const startingOrganizationName = 'سازمان پیش‌فرض';
const startingProductName = 'کالای نمونه';
const browserEditName = 'کالای تازه';
const knownTemporaryNames = new Set(['نباید ذخیره شود', browserEditName]);

const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
assert.ok(credentials.editor?.email && credentials.editor?.password, 'Local editor credentials are unavailable.');
assert.ok(credentials.reader?.email && credentials.reader?.password, 'Local reader credentials are unavailable.');

await mkdir(profileRoot, { recursive: true });
await mkdir(screenshotDirectory, { recursive: true });

const profileDirectory = await mkdtemp(path.join(profileRoot, 'p03-browser-'));
const resolvedProfile = path.resolve(profileDirectory);
assert.ok(resolvedProfile.startsWith(`${profileRoot}${path.sep}`), 'Browser profile escaped the ignored test directory.');

let browserProcess;
let cdp;
let editorAuthenticated = false;
const failures = [];
const screenshots = [];

class CdpPage {
    constructor(webSocketUrl) {
        this.socket = new WebSocket(webSocketUrl);
        this.nextId = 0;
        this.pending = new Map();
        this.requests = new Map();
        this.apiCookieObservations = [];
        this.apiResponseStatuses = [];
        this.opened = new Promise((resolve, reject) => {
            this.socket.addEventListener('open', resolve, { once: true });
            this.socket.addEventListener('error', reject, { once: true });
        });
        this.socket.addEventListener('message', (event) => {
            let message;
            try {
                message = JSON.parse(String(event.data));
            } catch {
                return;
            }

            if (!message.id) {
                if (message.method === 'Runtime.exceptionThrown') {
                    failures.push(message.params.exceptionDetails?.text ?? 'Browser JavaScript raised an exception.');
                } else if (message.method === 'Network.loadingFailed') {
                    const errorText = message.params.errorText ?? 'unknown network error';
                    if (errorText !== 'net::ERR_ABORTED') {
                        failures.push(`Browser request failed: ${errorText}`);
                    }
                } else if (message.method === 'Network.requestWillBeSent') {
                    const url = new URL(message.params.request.url);
                    if (url.origin === new URL(baseUrl).origin) {
                        this.requests.set(message.params.requestId, {
                            method: message.params.request.method,
                            path: url.pathname,
                        });
                    }
                } else if (message.method === 'Network.requestWillBeSentExtraInfo') {
                    const request = this.requests.get(message.params.requestId);
                    if (request?.path.startsWith('/api/')) {
                        const cookieHeader = Object.entries(message.params.headers ?? {}).find(([name]) => name.toLowerCase() === 'cookie')?.[1];
                        this.apiCookieObservations.push({
                            method: request.method,
                            path: request.path,
                            cookieNames: typeof cookieHeader === 'string'
                                ? cookieHeader.split(';').map((part) => part.trim().split('=', 1)[0])
                                : [],
                        });
                    }
                } else if (message.method === 'Network.responseReceived') {
                    const request = this.requests.get(message.params.requestId);
                    if (request?.path.startsWith('/api/')) {
                        this.apiResponseStatuses.push({ method: request.method, path: request.path, status: message.params.response.status });
                    }
                }
                return;
            }

            const pending = this.pending.get(message.id);
            if (!pending) return;

            clearTimeout(pending.timeout);
            this.pending.delete(message.id);

            if (message.error) {
                pending.reject(new Error(`CDP ${pending.method} failed: ${message.error.message}`));
            } else {
                pending.resolve(message.result ?? {});
            }
        });
    }

    async send(method, params = {}, timeoutMs = 20000) {
        await this.opened;
        const id = ++this.nextId;

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`CDP ${method} timed out.`));
            }, timeoutMs);

            this.pending.set(id, { method, resolve, reject, timeout });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }

    async evaluate(expression) {
        const response = await this.send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true,
        });

        if (response.exceptionDetails) {
            throw new Error(`Browser evaluation failed: ${response.exceptionDetails.text ?? 'unknown error'}`);
        }

        return response.result?.value;
    }

    close() {
        this.socket.close();
    }
}

function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitUntil(description, predicate, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const value = await cdp.evaluate(predicate());
        if (value) return value;
        await delay(100);
    }

    const pageState = await cdp.evaluate(`({
        path: location.pathname,
        readyState: document.readyState,
        title: document.title,
        mount: Boolean(document.querySelector('#app')),
        bodyText: document.body?.innerText?.slice(0, 160) ?? '',
        scripts: [...document.scripts].map((script) => script.src.split('?')[0])
    })`);

    throw new Error(`Timed out waiting for ${description}: ${JSON.stringify({ pageState, failures })}`);
}

async function navigate(pathname) {
    const result = await cdp.send('Page.navigate', { url: new URL(pathname, baseUrl).href });
    assert.equal(result.errorText, undefined, 'Browser navigation failed.');
    await waitUntil('document load', () => `document.readyState === 'complete'`);
    await waitUntil('React page mount', () => `Boolean(document.querySelector('#app')?.firstElementChild)`);
}

async function waitForProductRegister() {
    await waitUntil('product register search field', () => `Boolean(document.querySelector('input[type="search"]'))`);
    await waitUntil('product register table', () => `Boolean(document.querySelector('.product-table tbody'))`);
}

async function setInput(selector, value) {
    const result = await cdp.evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) return false;
        const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value');
        descriptor?.set?.call(element, ${JSON.stringify(value)});
        element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    })()`);

    assert.equal(result, true, `Required field was not found: ${selector}`);
    await delay(60);
}

async function submitForm(selector) {
    const result = await cdp.evaluate(`(() => {
        const form = document.querySelector(${JSON.stringify(selector)});
        if (!form) return false;
        form.requestSubmit();
        return true;
    })()`);

    assert.equal(result, true, `Required form was not found: ${selector}`);
}

async function browserFetch(pathname, method = 'GET', body = undefined, includeCsrf = true) {
    const csrf = includeCsrf
        ? await cdp.evaluate(`document.querySelector('meta[name="csrf-token"]')?.content ?? ''`)
        : '';
    const options = {
        method,
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...(includeCsrf && method !== 'GET' ? { 'X-CSRF-TOKEN': csrf } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
    const response = await cdp.evaluate(`(async () => {
        const response = await fetch(${JSON.stringify(pathname)}, ${JSON.stringify(options)});
        return { status: response.status, url: response.url, body: await response.text() };
    })()`);

    return {
        status: response.status,
        body: response.body ? JSON.parse(response.body) : null,
    };
}

async function currentProducts() {
    const response = await browserFetch('/api/v1/products');
    assert.equal(response.status, 200, 'Authenticated product list request failed.');
    return response.body.data;
}

async function captureScreenshot(name, width, height) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width < 700,
    });
    await delay(250);

    const image = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
    });
    const filename = `p03-${name}-${timestamp}.png`;
    await writeFile(path.join(screenshotDirectory, filename), Buffer.from(image.data, 'base64'));
    screenshots.push({ filename, width, height });
}

async function login(email, password) {
    await setInput('#sign-in-email', email);
    await setInput('#sign-in-password', password);
    await submitForm('.auth-form');
    await waitUntil('workspace after sign-in', () => `location.pathname === '/products'`);
    await waitUntil('workspace React mount', () => `Boolean(document.querySelector('.workspace-account-bar'))`);
}

async function changeOrganizationByUi(organizationName) {
    const selected = await cdp.evaluate(`(() => {
        const select = document.querySelector('select[aria-label="انتخاب سازمان فعال"]');
        if (!select) return false;
        const option = [...select.options].find((item) => item.textContent.trim() === ${JSON.stringify(organizationName)});
        if (!option) return false;
        const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(select), 'value');
        descriptor?.set?.call(select, option.value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    })()`);

    assert.equal(selected, true, 'Allowed organization selector did not expose the requested membership.');

    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        const context = await browserFetch('/api/v1/workspace');
        if (context.status === 200 && context.body.active_organization.name === organizationName) return context.body;
        await delay(150);
    }

    throw new Error('Organization selector did not activate the selected membership.');
}

async function updateNameThroughUi(name) {
    await setInput('#product-display-name', name);
    await submitForm('.product-edit-form');
    await waitUntil('product update confirmation', () => `document.querySelector('.edit-result')?.textContent.includes('ذخیره شد')`);

    const products = await currentProducts();
    assert.equal(products[0]?.name, name, 'Product update did not persist through the browser session.');
}

async function restoreStartingProductAfterFailure() {
    if (!cdp || !editorAuthenticated) return;

    try {
        const activeOrganizationName = await cdp.evaluate(`document.querySelector('.organization-picker')?.innerText ?? ''`);
        if (!activeOrganizationName.includes(startingOrganizationName)) {
            await changeOrganizationByUi(startingOrganizationName);
        }

        await navigate('/products/1');
        await waitUntil('editor workspace before cleanup', () => `Boolean(document.querySelector('.workspace-account-bar'))`);
        await waitUntil('editor cleanup detail form', () => `Boolean(document.querySelector('.product-edit-form'))`);
        const currentName = await cdp.evaluate(`document.querySelector('#detail-title')?.textContent ?? ''`);

        if (currentName === startingProductName) return;
        if (!knownTemporaryNames.has(currentName)) {
            throw new Error('The product name changed to an unrecognized value; preserving it for manual review.');
        }

        await updateNameThroughUi(startingProductName);
        await navigate('/products/1');
        await waitUntil('restored product detail', () => `document.querySelector('#detail-title')?.textContent === ${JSON.stringify(startingProductName)}`);
    } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown cleanup error';
        process.stderr.write(`P03 browser cleanup could not confirm restoration of the starting product name: ${reason}\n`);
    }
}

async function hasHttpOnlySessionCookie() {
    const response = await cdp.send('Network.getCookies', { urls: [baseUrl] });
    return response.cookies.some((cookie) => cookie.httpOnly && cookie.path === '/' && /session/i.test(cookie.name));
}

async function startBrowser() {
    browserProcess = spawn(browserPath, [
        '--headless=new',
        '--disable-gpu',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-extensions',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDirectory}`,
        '--window-size=1280,900',
        'about:blank',
    ], { stdio: 'ignore', windowsHide: true });

    const activePortFile = path.join(profileDirectory, 'DevToolsActivePort');
    const deadline = Date.now() + 15000;
    let port;

    while (Date.now() < deadline) {
        try {
            [port] = (await readFile(activePortFile, 'utf8')).trim().split(/\r?\n/);
            if (port) break;
        } catch {
            if (browserProcess.exitCode !== null) throw new Error('Edge exited before the debugging endpoint was ready.');
            await delay(100);
        }
    }

    assert.ok(port, 'Edge did not publish a local debugging port.');
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
    const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
    assert.ok(page, 'Edge did not expose its initial page target.');

    cdp = new CdpPage(page.webSocketDebuggerUrl);
    await cdp.opened;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
}

try {
    await startBrowser();
    await navigate('/products');

    assert.equal(await cdp.evaluate(`location.pathname`), '/sign-in', 'Guest workspace navigation did not redirect to sign-in.');
    await waitUntil('sign-in React form', () => `Boolean(document.querySelector('#sign-in-email'))`);
    await captureScreenshot('sign-in-desktop', 1280, 900);
    await captureScreenshot('sign-in-mobile', 390, 844);

    await setInput('#sign-in-email', 'missing@erp.local');
    await setInput('#sign-in-password', 'invalid-local-test-value');
    await submitForm('.auth-form');
    await waitUntil('generic invalid-credentials message', () => `document.querySelector('.auth-error')?.textContent.includes('ایمیل یا گذرواژه معتبر نیست')`);

    await login(credentials.editor.email, credentials.editor.password);
    editorAuthenticated = true;
    assert.equal(await hasHttpOnlySessionCookie(), true, 'The authenticated browser did not retain its HTTP-only session cookie.');

    await changeOrganizationByUi(startingOrganizationName);
    let workspace = await browserFetch('/api/v1/workspace');
    if (workspace.status !== 200) {
        const uiState = await cdp.evaluate(`({
            origin: location.origin,
            path: location.pathname,
            organization: document.querySelector('.organization-picker')?.innerText ?? null,
            role: document.querySelector('.role-badge')?.innerText ?? null,
            cookieNames: document.cookie.split(';').map((part) => part.trim().split('=', 1)[0])
        })`);
        throw new Error(`Editor workspace request failed (${workspace.status}; url=${workspace.url}; body=${JSON.stringify(workspace.body)}; ui=${JSON.stringify(uiState)}; apiCookieNames=${JSON.stringify(cdp.apiCookieObservations.slice(-5))}; apiStatuses=${JSON.stringify(cdp.apiResponseStatuses.slice(-5))}).`);
    }
    assert.equal(workspace.body.active_organization.role, 'editor', 'Editor role was not resolved from the active membership.');
    assert.equal(workspace.body.capabilities.products.update, true, 'Editor update capability was not returned.');

    const originalProduct = (await currentProducts()).find((product) => product.code === 'DEMO-001');
    assert.ok(originalProduct, 'Starting organization product was not returned.');
    assert.equal(originalProduct.id, 1, 'Existing product ID changed.');
    if (originalProduct.name !== startingProductName) {
        assert.ok(knownTemporaryNames.has(originalProduct.name), 'Existing product name changed to an unrecognized value.');
        await navigate(`/products/${originalProduct.id}`);
        await waitUntil('editor restore form', () => `Boolean(document.querySelector('.product-edit-form'))`);
        await updateNameThroughUi(startingProductName);
        await navigate(`/products/${originalProduct.id}`);
        await waitUntil('restored starting product', () => `document.querySelector('#detail-title')?.textContent === ${JSON.stringify(startingProductName)}`);
        originalProduct.name = startingProductName;
    }

    await navigate('/products');
    await waitForProductRegister();
    await setInput('input[type="search"]', 'DEMO-001');
    const filteredRows = await cdp.evaluate(`document.querySelectorAll('.product-table tbody tr').length`);
    assert.equal(filteredRows, 1, 'The existing code filter did not return the seeded product.');
    await setInput('input[type="search"]', '');
    await waitUntil('product quick-view trigger', () => `Boolean(document.querySelector('.quick-view-trigger'))`);
    await cdp.evaluate(`document.querySelector('.quick-view-trigger')?.click()`);
    await waitUntil('quick-view dialog', () => `Boolean(document.querySelector('dialog.quick-view-dialog[open]'))`);
    assert.equal(await cdp.evaluate(`document.activeElement?.getAttribute('aria-label')`), 'بستن نمایش سریع', 'Quick-view keyboard focus did not enter the dialog.');
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await waitUntil('quick-view close', () => `!document.querySelector('dialog.quick-view-dialog[open]')`);

    await captureScreenshot('editor-register-desktop', 1280, 900);
    await navigate(`/products/${originalProduct.id}`);
    await waitUntil('editor product form', () => `Boolean(document.querySelector('.product-edit-form'))`);

    const csrfFailure = await browserFetch(`/api/v1/products/${originalProduct.id}`, 'PATCH', { name: 'نباید ذخیره شود' }, false);
    assert.equal(csrfFailure.status, 419, 'A product write without a CSRF token was not rejected.');

    await updateNameThroughUi(browserEditName);
    await navigate(`/products/${originalProduct.id}`);
    await waitUntil('refreshed editor product', () => `document.querySelector('#detail-title')?.textContent === ${JSON.stringify(browserEditName)}`);
    await captureScreenshot('editor-renamed-detail-desktop', 1280, 900);

    const organizationBContext = await changeOrganizationByUi('سازمان آزمایشی ب');
    const organizationBId = organizationBContext.active_organization.id;
    assert.equal(organizationBContext.active_organization.role, 'reader', 'Membership role did not change with the active organization.');
    assert.equal(organizationBContext.capabilities.products.update, false, 'Read-only organization capability was not applied.');
    await navigate('/products');
    await waitForProductRegister();
    let productsB = await currentProducts();
    assert.equal(productsB.length, 1, 'The second organization product list has an unexpected shape.');
    assert.equal(productsB[0].code, 'DEMO-001', 'The second organization product code is missing.');
    assert.equal(productsB[0].name, 'کالای نمونه سازمان ب', 'The second organization returned the wrong product.');
    assert.equal(await cdp.evaluate(`Boolean(document.querySelector('.product-edit-form'))`), false, 'Read-only membership displayed the edit control.');
    await captureScreenshot('organization-b-register-desktop', 1280, 900);

    await changeOrganizationByUi('سازمان پیش‌فرض');
    await navigate(`/products/${productsB[0].id}`);
    await waitUntil('foreign product unavailable state', () => `Boolean(document.querySelector('.unknown-panel'))`);
    const foreignDetailText = await cdp.evaluate(`document.querySelector('.unknown-panel')?.innerText ?? ''`);
    assert.equal(foreignDetailText.includes(productsB[0].name), false, 'Direct foreign product navigation exposed its name.');

    await navigate(`/products/${originalProduct.id}`);
    await waitUntil('editor restore form', () => `Boolean(document.querySelector('.product-edit-form'))`);
    await updateNameThroughUi('کالای نمونه');
    await navigate(`/products/${originalProduct.id}`);
    await waitUntil('restored original product name', () => `document.querySelector('#detail-title')?.textContent === 'کالای نمونه'`);

    await cdp.evaluate(`document.querySelector('.sign-out-button')?.click()`);
    await waitUntil('editor sign-out', () => `location.pathname === '/sign-in'`);
    editorAuthenticated = false;
    const loggedOutProducts = await browserFetch('/api/v1/products');
    assert.equal(loggedOutProducts.status, 401, 'API remained accessible after sign-out.');
    await navigate('/products/1');
    assert.equal(await cdp.evaluate(`location.pathname`), '/sign-in', 'Protected product navigation remained accessible after sign-out.');

    await login(credentials.reader.email, credentials.reader.password);
    workspace = await browserFetch('/api/v1/workspace');
    assert.equal(workspace.status, 200, 'Reader workspace request did not use the browser session.');
    assert.equal(workspace.body.active_organization.role, 'reader', 'Read-only role was not resolved from membership.');
    assert.equal(workspace.body.capabilities.products.update, false, 'Read-only capability was not returned.');
    await navigate(`/products/${originalProduct.id}`);
    await waitUntil('reader product detail', () => `Boolean(document.querySelector('#detail-title'))`);
    assert.equal(await cdp.evaluate(`Boolean(document.querySelector('.product-edit-form'))`), false, 'Reader detail displayed the edit form.');

    const readerUpdate = await browserFetch(`/api/v1/products/${originalProduct.id}`, 'PATCH', { name: 'تلاش ویرایش خواننده' });
    assert.equal(readerUpdate.status, 403, 'Reader direct API write was not forbidden.');
    const foreignUpdate = await browserFetch(`/api/v1/products/${productsB[0].id}`, 'PATCH', { name: 'تلاش محصول سازمان دیگر' });
    const unknownUpdate = await browserFetch('/api/v1/products/999999', 'PATCH', { name: 'تلاش شناسه ناموجود' });
    assert.equal(foreignUpdate.status, 404, 'Foreign product ID was not hidden.');
    assert.equal(unknownUpdate.status, 404, 'Unknown product ID did not use the same public status.');
    const unownedSwitch = await browserFetch('/api/v1/active-organization', 'POST', { organization_id: organizationBId });
    assert.equal(unownedSwitch.status, 403, 'An unowned organization selection was accepted.');
    const unchanged = await currentProducts();
    assert.equal(unchanged.find((product) => product.id === originalProduct.id)?.name, 'کالای نمونه', 'A rejected reader write changed stored data.');

    await navigate('/products');
    await waitForProductRegister();
    await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
    });
    await delay(250);
    const mobileMetrics = await cdp.evaluate(`({
        width: window.innerWidth,
        height: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        focusBottom: document.querySelector('[data-lg-role="focus"]')?.getBoundingClientRect().bottom ?? null,
        dockTop: document.querySelector('.mobile-focus-dock')?.getBoundingClientRect().top ?? null,
        canEdit: Boolean(document.querySelector('.product-edit-form'))
    })`);
    assert.equal(mobileMetrics.width, 390, 'Mobile viewport width is not 390px.');
    assert.equal(mobileMetrics.height, 844, 'Mobile viewport height is not 844px.');
    assert.ok(mobileMetrics.documentWidth <= mobileMetrics.width + 1, 'Mobile register has horizontal overflow.');
    assert.equal(mobileMetrics.canEdit, false, 'Reader mobile register displayed an edit form.');
    await captureScreenshot('reader-register-mobile', 390, 844);

    await navigate(`/products/${originalProduct.id}`);
    await waitUntil('mobile reader detail', () => `Boolean(document.querySelector('#detail-title'))`);
    const detailMetrics = await cdp.evaluate(`({
        width: window.innerWidth,
        height: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        focusBottom: document.querySelector('[data-lg-role="focus"]')?.getBoundingClientRect().bottom ?? null,
        dockTop: document.querySelector('.mobile-focus-dock')?.getBoundingClientRect().top ?? null,
        hasEditForm: Boolean(document.querySelector('.product-edit-form'))
    })`);
    assert.ok(detailMetrics.documentWidth <= detailMetrics.width + 1, 'Mobile detail has horizontal overflow.');
    assert.equal(detailMetrics.hasEditForm, false, 'Reader mobile detail displayed the edit form.');
    await captureScreenshot('reader-detail-mobile', 390, 844);
    if (!(detailMetrics.focusBottom < detailMetrics.dockTop)) {
        throw new Error(`Mobile detail content overlaps the fixed navigation dock (focus bottom ${detailMetrics.focusBottom}px, dock top ${detailMetrics.dockTop}px, gap ${detailMetrics.dockTop - detailMetrics.focusBottom}px).`);
    }

    await cdp.evaluate(`document.querySelector('.sign-out-button')?.click()`);
    await waitUntil('reader sign-out', () => `location.pathname === '/sign-in'`);
    const finalGuestApi = await browserFetch('/api/v1/products');
    assert.equal(finalGuestApi.status, 401, 'Reader API session survived logout.');
    assert.deepEqual(failures, [], 'Browser runtime reported JavaScript exceptions.');

    const evidence = {
        browser: 'Google Chrome headless',
        viewportChecks: {
            desktop: { width: 1280, height: 900 },
            mobile: { width: 390, height: 844, horizontalOverflow: mobileMetrics.documentWidth - mobileMetrics.width, detailDockGap: detailMetrics.dockTop - detailMetrics.focusBottom },
        },
        assertions: [
            'Guest browser navigation redirects to sign-in; guest product API returns 401.',
            'Invalid credentials show a generic error; valid login establishes an HTTP-only session cookie.',
            'Same-origin API reads use the real browser session cookie.',
            'A product PATCH without CSRF returns 419; the editor UI PATCH succeeds and survives refresh.',
            'Organization switching changes the active product list and resolves the editor membership as reader in organization B.',
            'Reader UI hides the edit form; direct update returns 403 and leaves the row unchanged.',
            'Direct foreign product detail shows only the generic unavailable state; foreign and unknown writes both return 404; reader cannot switch to an unowned organization.',
            'Logout removes access to the protected browser route and API.',
            'P02 product code filter and quick-view dialog continue to work.',
        ],
        screenshots,
        runtimeExceptions: failures.length,
    };

    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} finally {
    await restoreStartingProductAfterFailure();
    cdp?.close();

    if (browserProcess && browserProcess.exitCode === null) {
        browserProcess.kill();
        await Promise.race([
            new Promise((resolve) => browserProcess.once('exit', resolve)),
            delay(5000),
        ]);
    }

    await rm(resolvedProfile, { recursive: true, force: true });
}
