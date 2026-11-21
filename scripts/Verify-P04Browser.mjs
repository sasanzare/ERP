import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.P04_BROWSER_BASE_URL ?? 'http://127.0.0.1:8000';
const browserPath = process.env.P04_BROWSER_EXECUTABLE ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const credentialsPath = path.join(projectRoot, 'storage', 'app', 'private', 'p03-demo-credentials.json');
const screenshotDirectory = path.join(projectRoot, 'docs', 'screenshots');
const profileRoot = path.resolve(projectRoot, 'storage', 'framework', 'testing');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const partyCode = 'P04-UI-ACCEPT-20261121';
const partyInitialName = 'طرف پذیرش P04';
const partyEditedName = 'طرف ویرایش‌شده P04';

const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
assert.ok(credentials.editor?.email && credentials.editor?.password, 'Local editor credentials are unavailable.');
assert.ok(credentials.reader?.email && credentials.reader?.password, 'Local reader credentials are unavailable.');
await access(browserPath);

await mkdir(profileRoot, { recursive: true });
await mkdir(screenshotDirectory, { recursive: true });

const profileDirectory = await mkdtemp(path.join(profileRoot, 'p04-browser-'));
const resolvedProfile = path.resolve(profileDirectory);
assert.ok(resolvedProfile.startsWith(`${profileRoot}${path.sep}`), 'Browser profile escaped the ignored test directory.');

let browserProcess;
let cdp;
let editorAuthenticated = false;
let partyId = null;
let partyOriginalName = null;
const browserErrors = [];
const screenshots = [];

class CdpPage {
    constructor(webSocketUrl) {
        this.socket = new WebSocket(webSocketUrl);
        this.nextId = 0;
        this.pending = new Map();
        this.requests = new Map();
        this.apiResponseStatuses = [];
        this.loadEvents = 0;
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
                    browserErrors.push(message.params.exceptionDetails?.text ?? 'Browser JavaScript raised an exception.');
                } else if (message.method === 'Network.loadingFailed' && message.params.errorText !== 'net::ERR_ABORTED') {
                    browserErrors.push(`Browser request failed: ${message.params.errorText ?? 'unknown network error'}`);
                } else if (message.method === 'Network.requestWillBeSent') {
                    const url = new URL(message.params.request.url);
                    if (url.origin === new URL(baseUrl).origin) {
                        this.requests.set(message.params.requestId, { method: message.params.request.method, path: url.pathname });
                    }
                } else if (message.method === 'Network.responseReceived') {
                    const request = this.requests.get(message.params.requestId);
                    if (request) this.apiResponseStatuses.push({ ...request, status: message.params.response.status });
                } else if (message.method === 'Page.loadEventFired') {
                    this.loadEvents += 1;
                }
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
        if (response.exceptionDetails) throw new Error(`Browser evaluation failed: ${response.exceptionDetails.text ?? 'unknown error'}`);
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
    const snapshot = await cdp.evaluate(`({ path: location.pathname, body: document.body?.innerText?.slice(0, 220) ?? '' })`);
    throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(snapshot)}`);
}

async function navigate(pathname) {
    const priorLoadEvents = cdp.loadEvents;
    const result = await cdp.send('Page.navigate', { url: new URL(pathname, baseUrl).href });
    assert.ok(result.errorText === undefined || result.errorText === 'net::ERR_ABORTED', 'Chrome navigation failed.');
    await waitForPageLoad(priorLoadEvents);
    await waitUntil('document load', () => `document.readyState === 'complete'`);
    await waitUntil('React mount', () => `Boolean(document.querySelector('#app')?.firstElementChild)`);
}

async function waitForPageLoad(previousCount) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        if (cdp.loadEvents > previousCount) return;
        await delay(50);
    }
    throw new Error('Chrome did not finish the current navigation.');
}

async function waitForApiResponse(method, pathname, status) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        const response = cdp.apiResponseStatuses.findLast((item) => item.method === method && item.path === pathname && item.status === status);
        if (response) return response;
        await delay(50);
    }
    throw new Error(`Browser request ${method} ${pathname} did not return ${status}.`);
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
    await delay(80);
}

async function click(selector) {
    const clicked = await cdp.evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; element.click(); return true; })()`);
    assert.equal(clicked, true, `Required control was not found: ${selector}`);
}

async function submitForm(selector) {
    const submitted = await cdp.evaluate(`(() => { const form = document.querySelector(${JSON.stringify(selector)}); if (!form) return false; form.requestSubmit(); return true; })()`);
    assert.equal(submitted, true, `Required form was not found: ${selector}`);
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
    const response = await cdp.evaluate(`(async () => {
        const response = await fetch(${JSON.stringify(pathname)}, ${JSON.stringify(options)});
        return { status: response.status, body: await response.text() };
    })()`);
    return { status: response.status, body: response.body ? JSON.parse(response.body) : null };
}

async function captureScreenshot(name, width, height) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
    });
    await delay(300);
    const image = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    const filename = `p04-${name}-${timestamp}.png`;
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
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        const response = await browserFetch('/api/v1/workspace');
        if (response.status === 200 && response.body.active_organization.name === name) return response.body;
        await delay(150);
    }
    throw new Error(`Organization switch to ${name} did not complete.`);
}

async function restorePartyName() {
    if (!cdp || !editorAuthenticated || partyId === null || partyOriginalName === null) return;
    try {
        const context = await browserFetch('/api/v1/workspace');
        if (context.status === 200 && context.body.active_organization.name !== 'سازمان پیش‌فرض') {
            await changeOrganizationByUi('سازمان پیش‌فرض');
        }
        await navigate(`/parties/${partyId}`);
        await waitUntil('party restore form', () => `Boolean(document.querySelector('#master-display-name'))`);
        await setInput('#master-display-name', partyOriginalName);
        const loadCount = cdp.loadEvents;
        cdp.apiResponseStatuses.length = 0;
        await submitForm('.master-form');
        await waitForApiResponse('PATCH', `/api/v1/parties/${partyId}`, 200);
        await waitForPageLoad(loadCount);
        await waitUntil('party name restoration', () => `document.querySelector('#master-display-name')?.value === ${JSON.stringify(partyOriginalName)}`);
    } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown restore error';
        process.stderr.write(`P04 browser could not confirm party-name restoration: ${reason}\n`);
    }
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
            if (browserProcess.exitCode !== null) throw new Error('Chrome exited before its debugging endpoint was ready.');
            await delay(100);
        }
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

let acceptanceSummary;

try {
    await startBrowser();
    await navigate('/products');
    assert.equal(await cdp.evaluate('location.pathname'), '/sign-in', 'Guest browser navigation did not redirect to sign-in.');
    await login(credentials.editor.email, credentials.editor.password);
    editorAuthenticated = true;
    await changeOrganizationByUi('سازمان پیش‌فرض');
    const workspace = await browserFetch('/api/v1/workspace');
    assert.equal(workspace.status, 200, 'Editor workspace API did not use the browser session.');
    assert.equal(workspace.body.active_organization.role, 'editor', 'Editor membership role was not resolved.');

    const [productsResponse, unitsResponse, listsResponse, warehousesResponse, locationsResponse, partiesResponse] = await Promise.all([
        browserFetch('/api/v1/products'),
        browserFetch('/api/v1/units'),
        browserFetch('/api/v1/price-lists'),
        browserFetch('/api/v1/warehouses'),
        browserFetch('/api/v1/locations'),
        browserFetch('/api/v1/parties'),
    ]);
    for (const response of [productsResponse, unitsResponse, listsResponse, warehousesResponse, locationsResponse, partiesResponse]) {
        assert.equal(response.status, 200, 'An organization-scoped P04 register did not load.');
    }
    const demoProduct = productsResponse.body.data.find((item) => item.code === 'DEMO-002');
    const existingUnit = unitsResponse.body.data.find((item) => item.code === 'EA');
    const listA = listsResponse.body.data.find((item) => item.code === 'RETAIL-A');
    const listB = listsResponse.body.data.find((item) => item.code === 'RETAIL-B');
    const firstWarehouse = warehousesResponse.body.data.find((item) => item.code === 'WH-MAIN');
    const secondWarehouse = warehousesResponse.body.data.find((item) => item.code === 'WH-SECOND');
    const firstLocation = locationsResponse.body.data.find((item) => item.code === 'LOC-A-01');
    const secondLocation = locationsResponse.body.data.find((item) => item.code === 'LOC-B-01');
    assert.ok(demoProduct && existingUnit && listA && listB && firstWarehouse && secondWarehouse && firstLocation && secondLocation, 'P04 demo fixtures were not provisioned.');

    const existingParty = partiesResponse.body.data.find((item) => item.code === partyCode);
    if (existingParty) {
        partyId = existingParty.id;
        partyOriginalName = existingParty.display_name;
        assert.deepEqual(existingParty.roles.slice().sort(), ['customer', 'supplier'], 'Existing acceptance party does not hold both roles.');
    } else {
        partyOriginalName = partyInitialName;
        await navigate('/parties/new');
        await waitUntil('new-party form', () => `Boolean(document.querySelector('#master-display-name'))`);
        await setInput('#master-code', partyCode);
        await setInput('#master-display-name', partyInitialName);
        const supplierClicked = await cdp.evaluate(`(() => {
            const label = [...document.querySelectorAll('.master-role-field label')].find((item) => item.textContent.includes('تأمین‌کننده'));
            if (!label) return false;
            label.click();
            return true;
        })()`);
        assert.equal(supplierClicked, true, 'Supplier role checkbox was not available in the party form.');
        const loadCount = cdp.loadEvents;
        cdp.apiResponseStatuses.length = 0;
        await submitForm('.master-form');
        await waitForApiResponse('POST', '/api/v1/parties', 201);
        await waitForPageLoad(loadCount);
        await waitUntil('party created by editor UI', () => `location.pathname.startsWith('/parties/') && location.pathname.split('/').length === 3`);
        partyId = Number((await cdp.evaluate('location.pathname')).split('/').pop());
        const roles = await browserFetch('/api/v1/parties/'+partyId);
        assert.equal(roles.status, 200);
        assert.deepEqual(roles.body.data.roles.slice().sort(), ['customer', 'supplier']);
    }

    await navigate(`/parties/${partyId}`);
    await waitUntil('editable party detail', () => `Boolean(document.querySelector('#master-display-name'))`);
    await setInput('#master-display-name', partyEditedName);
    const editLoadCount = cdp.loadEvents;
    cdp.apiResponseStatuses.length = 0;
    await submitForm('.master-form');
    await waitForApiResponse('PATCH', `/api/v1/parties/${partyId}`, 200);
    await waitForPageLoad(editLoadCount);
    await waitUntil('party edit persisted after reload', () => `document.querySelector('#master-display-name')?.value === ${JSON.stringify(partyEditedName)}`);
    await navigate('/parties');
    await waitUntil('party register', () => `Boolean(document.querySelector('.master-table tbody'))`);
    await setInput('input[type="search"]', partyCode);
    await click('.role-filter button:nth-of-type(2)');
    await waitUntil('customer role-filter result', () => `Boolean(document.querySelector('a[href="/parties/${partyId}"]'))`);
    const customerViewName = await cdp.evaluate(`document.querySelector('a[href="/parties/${partyId}"]')?.innerText ?? ''`);
    await click('.role-filter button:nth-of-type(3)');
    await waitUntil('supplier role-filter result', () => `Boolean(document.querySelector('a[href="/parties/${partyId}"]'))`);
    const supplierViewName = await cdp.evaluate(`document.querySelector('a[href="/parties/${partyId}"]')?.innerText ?? ''`);
    assert.ok(customerViewName.includes(partyEditedName) && supplierViewName.includes(partyEditedName), 'Customer and supplier filters did not show the same edited party.');
    await setInput('input[type="search"]', '');
    await captureScreenshot('party-register-desktop', 1280, 900);
    await navigate(`/parties/${partyId}`);
    await waitUntil('party editor detail', () => `Boolean(document.querySelector('#master-display-name'))`);
    await captureScreenshot('party-detail-mobile', 390, 844);
    await cdp.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await delay(200);
    const partyMobileMetrics = await cdp.evaluate(`({
        width: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        lastControlBottom: document.querySelector('.master-form-actions')?.getBoundingClientRect().bottom ?? null,
        dockTop: document.querySelector('.mobile-focus-dock')?.getBoundingClientRect().top ?? null,
    })`);
    assert.equal(partyMobileMetrics.width, 390);
    assert.ok(partyMobileMetrics.documentWidth <= partyMobileMetrics.clientWidth + 1, 'P04 mobile party form has horizontal overflow.');
    assert.ok(partyMobileMetrics.lastControlBottom < partyMobileMetrics.dockTop, 'Mobile party form action overlaps the fixed dock.');

    await navigate('/products');
    await waitUntil('product register quick-view control', () => `Boolean(document.querySelector('.quick-view-trigger'))`);
    await click('.quick-view-trigger');
    await waitUntil('existing product quick-view dialog', () => `Boolean(document.querySelector('dialog.quick-view-dialog[open]'))`);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await waitUntil('quick-view closed', () => `!document.querySelector('dialog.quick-view-dialog[open]')`);

    await click('.surface-heading button');
    await waitUntil('product creation form', () => `Boolean(document.querySelector('.product-create-form'))`);
    await setInput('#new-product-code', demoProduct.code);
    await setInput('#new-product-name', 'کالای تکراری نباید ثبت شود');
    await submitForm('.product-create-form');
    await waitUntil('duplicate product code message', () => `Boolean(document.querySelector('.product-create-form .edit-result')?.textContent.trim())`);
    const duplicateMessage = await cdp.evaluate(`document.querySelector('.product-create-form .edit-result')?.textContent ?? ''`);
    assert.ok(duplicateMessage.length > 0, 'Duplicate product code did not show a validation message.');
    await click('.product-create-form .dialog-dismiss-button');

    const productDetailResponse = await browserFetch(`/api/v1/products/${demoProduct.id}`);
    assert.equal(productDetailResponse.status, 200, 'Seeded priceable product detail was not available.');
    assert.equal(productDetailResponse.body.data.base_unit.code, 'EA', 'Seeded product did not retain its authorized base unit.');
    await navigate(`/products/${demoProduct.id}`);
    await waitUntil('product base-unit form', () => `document.querySelector('#product-base-unit')?.value === ${JSON.stringify(String(existingUnit.id))}`);
    const detailUnitText = await cdp.evaluate(`document.querySelector('.detail-fields')?.innerText ?? ''`);
    assert.ok(detailUnitText.includes('عدد'), 'Product detail did not show its base unit.');
    await captureScreenshot('product-base-unit-desktop', 1280, 900);

    const priceA = await browserFetch(`/api/v1/price-lists/${listA.id}/products/${demoProduct.id}`);
    const priceB = await browserFetch(`/api/v1/price-lists/${listB.id}/products/${demoProduct.id}`);
    assert.equal(priceA.body.data.amount_rial, '120000');
    assert.equal(priceB.body.data.amount_rial, '135000');
    await navigate(`/price-lists/${listA.id}`);
    await waitUntil('price lookup controls', () => `Boolean(document.querySelector('#price-product-selected'))`);
    await setSelect('#price-product-selected', demoProduct.id);
    await waitUntil('list A exact price displayed', () => `document.querySelector('.price-resolution strong')?.textContent.includes('۱۲۰')`);
    const displayedA = await cdp.evaluate(`document.querySelector('.price-resolution strong')?.textContent.trim() ?? ''`);
    assert.ok(displayedA.includes('۱۲۰٬۰۰۰') && displayedA.includes('ریال'), `List A price was not clearly labeled: ${displayedA}`);
    await cdp.evaluate(`document.querySelector('.price-resolution')?.scrollIntoView({ block: 'center' })`);
    await captureScreenshot('price-list-a-desktop', 1280, 900);

    await setSelect('#price-list-selected', listB.id);
    await waitUntil('list B detail route', () => `location.pathname === '/price-lists/${listB.id}'`);
    await waitUntil('list B price lookup controls', () => `Boolean(document.querySelector('#price-product-selected'))`);
    await setSelect('#price-product-selected', demoProduct.id);
    await waitUntil('list B exact price displayed', () => `document.querySelector('.price-resolution strong')?.textContent.includes('۱۳۵')`);
    const displayedB = await cdp.evaluate(`document.querySelector('.price-resolution strong')?.textContent.trim() ?? ''`);
    assert.ok(displayedB.includes('۱۳۵٬۰۰۰') && displayedB.includes('ریال'), `List B price was not clearly labeled: ${displayedB}`);
    await cdp.evaluate(`document.querySelector('.price-resolution')?.scrollIntoView({ block: 'center' })`);
    await captureScreenshot('price-list-b-desktop', 1280, 900);

    await setSelect('#price-product-selected', 1);
    await waitUntil('missing price state', () => `Boolean(document.querySelector('.price-resolution.is-unpriced'))`);
    assert.ok((await cdp.evaluate(`document.querySelector('.price-resolution')?.innerText ?? ''`)).includes('بدون قیمت'));

    const orgB = await changeOrganizationByUi('سازمان آزمایشی ب');
    assert.equal(orgB.active_organization.role, 'reader');
    const foreignUnits = await browserFetch('/api/v1/units');
    const foreignUnit = foreignUnits.body.data.find((item) => item.code === 'EA');
    assert.ok(foreignUnit, 'Organization B unit fixture was not provisioned.');
    const orgBParties = await browserFetch('/api/v1/parties');
    assert.equal(orgBParties.body.data.length, 0, 'Organization B party list leaked organization A records.');
    await changeOrganizationByUi('سازمان پیش‌فرض');

    const foreignUnitWrite = await browserFetch(`/api/v1/products/${demoProduct.id}`, 'PATCH', { base_unit_id: foreignUnit.id });
    assert.equal(foreignUnitWrite.status, 422, 'A foreign organization unit was accepted by the product endpoint.');
    const unchangedProduct = await browserFetch(`/api/v1/products/${demoProduct.id}`);
    assert.equal(unchangedProduct.body.data.base_unit.id, existingUnit.id, 'Rejected foreign unit changed the saved product.');

    const wrongWarehouse = await browserFetch('/api/v1/locations/validate-selection', 'POST', {
        warehouse_id: firstWarehouse.id,
        location_id: secondLocation.id,
    });
    assert.equal(wrongWarehouse.status, 422, 'A location from another warehouse passed server validation.');
    assert.equal(wrongWarehouse.body.errors.location_id[0].includes(secondLocation.name), false, 'Location mismatch exposed foreign selector details.');
    await navigate('/locations');
    await waitUntil('location selector workflow', () => `Boolean(document.querySelector('#pair-warehouse'))`);
    await setSelect('#pair-warehouse', firstWarehouse.id);
    await waitUntil('warehouse-filtered locations', () => `document.querySelectorAll('#pair-location option').length > 1`);
    const filteredLocations = await cdp.evaluate(`[...document.querySelectorAll('#pair-location option')].map((item) => item.textContent)`);
    assert.ok(filteredLocations.some((text) => text.includes('LOC-A-01')));
    assert.equal(filteredLocations.some((text) => text.includes('LOC-B-01')), false, 'Location options were not filtered by warehouse.');
    await setSelect('#pair-location', firstLocation.id);
    await click('.location-pair-check button');
    await waitUntil('valid warehouse-location pair', () => `document.querySelector('.location-pair-check .edit-result')?.textContent.includes('تطبیق دارند')`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await delay(250);
    await cdp.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await delay(200);
    await captureScreenshot('location-register-mobile', 390, 844);
    const mobileMetrics = await cdp.evaluate(`({
        width: window.innerWidth,
        height: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        focusBottom: document.querySelector('[data-lg-role="focus"]')?.getBoundingClientRect().bottom ?? null,
        lastControlBottom: document.querySelector('.location-pair-check button')?.getBoundingClientRect().bottom ?? null,
        dockTop: document.querySelector('.mobile-focus-dock')?.getBoundingClientRect().top ?? null,
        offenders: [...document.querySelectorAll('*')].map((element) => {
            const rect = element.getBoundingClientRect();
            return { tag: element.tagName, className: typeof element.className === 'string' ? element.className : '', left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width), scrollWidth: element.scrollWidth };
        }).filter((item) => item.right > window.innerWidth + 1 || item.left < -1).sort((a, b) => b.right - a.right).slice(0, 12),
    })`);
    assert.equal(mobileMetrics.width, 390);
    assert.equal(mobileMetrics.height, 844);
    assert.ok(mobileMetrics.documentWidth <= mobileMetrics.clientWidth + 1, `P04 mobile location view has horizontal overflow: ${JSON.stringify(mobileMetrics)}`);
    assert.ok(mobileMetrics.dockTop > 0, 'Mobile navigation dock is outside the viewport.');
    assert.ok(mobileMetrics.lastControlBottom < mobileMetrics.dockTop, 'Mobile location selector action overlaps the fixed dock.');

    await navigate(`/parties?glass=fallback&scene=bright`);
    await waitUntil('forced fallback party register', () => `Boolean(document.querySelector('.master-table tbody'))`);
    await delay(400);
    const fallbackState = await cdp.evaluate(`({ surfaces: document.querySelectorAll('.lg-surface').length, svgSurfaces: document.querySelectorAll('.lg-surface.lg-svg-ok').length })`);
    assert.ok(fallbackState.surfaces > 0, 'Liquid Glass surfaces were missing in fallback mode.');
    assert.equal(fallbackState.svgSurfaces, 0, 'Forced fallback still activated SVG refraction.');
    await captureScreenshot('party-register-fallback-mobile', 390, 844);

    const currentContext = await browserFetch('/api/v1/workspace');
    if (currentContext.status === 200 && currentContext.body.active_organization.name !== 'سازمان پیش‌فرض') {
        await changeOrganizationByUi('سازمان پیش‌فرض');
    }
    await navigate(`/parties/${partyId}`);
    partyOriginalName = partyOriginalName ?? partyInitialName;
    await waitUntil('party before reader acceptance', () => `Boolean(document.querySelector('#master-display-name'))`);
    await setInput('#master-display-name', partyOriginalName);
    const restoreLoadCount = cdp.loadEvents;
    cdp.apiResponseStatuses.length = 0;
    await submitForm('.master-form');
    await waitForApiResponse('PATCH', `/api/v1/parties/${partyId}`, 200);
    await waitForPageLoad(restoreLoadCount);
    await waitUntil('party final restoration', () => `document.querySelector('#master-display-name')?.value === ${JSON.stringify(partyOriginalName)}`);

    await click('.sign-out-button');
    await waitUntil('editor sign-out', () => `location.pathname === '/sign-in'`);
    editorAuthenticated = false;
    await login(credentials.reader.email, credentials.reader.password);
    const readerWorkspace = await browserFetch('/api/v1/workspace');
    assert.equal(readerWorkspace.body.active_organization.role, 'reader');
    await navigate('/parties');
    await waitUntil('reader party register', () => `Boolean(document.querySelector('.master-table tbody'))`);
    assert.equal(await cdp.evaluate(`Boolean(document.querySelector('.master-toolbar-create'))`), false, 'Reader saw a create action.');
    await navigate(`/parties/${partyId}`);
    await waitUntil('reader party detail', () => `Boolean(document.querySelector('#master-display-name'))`);
    assert.equal(await cdp.evaluate(`document.querySelector('#master-display-name')?.disabled`), true, 'Reader detail fields were editable.');
    const beforeReaderWrite = (await browserFetch('/api/v1/parties')).body.data.length;
    const readerWrite = await browserFetch('/api/v1/parties', 'POST', {
        code: 'P04-READER-DENIED', display_name: 'نباید ذخیره شود', roles: ['customer'],
    });
    assert.equal(readerWrite.status, 403, 'Reader direct API write was not forbidden.');
    const afterReaderWrite = (await browserFetch('/api/v1/parties')).body.data.length;
    assert.equal(afterReaderWrite, beforeReaderWrite, 'Rejected reader request changed the register.');

    const fallbackMetrics = await cdp.evaluate(`({ width: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, viewport: window.innerWidth })`);
    assert.ok(fallbackMetrics.width <= fallbackMetrics.clientWidth + 1, 'Forced fallback mobile view has horizontal overflow.');
    assert.deepEqual(browserErrors, [], 'Chrome reported JavaScript errors or failed requests.');

    acceptanceSummary = {
        browser: 'Google Chrome headless',
        viewports: { desktop: '1280x900', mobile: '390x844', fallback: '390x844' },
        party: { id: partyId, customerAndSupplierSameId: true, editedNameVisibleInBothFilters: true },
        product: { code: demoProduct.code, baseUnit: 'EA', duplicateCodeRejected: true, foreignUnitRejected: true },
        pricing: { selectedListA: priceA.body.data.amount_rial, selectedListB: priceB.body.data.amount_rial, missingEntryUnpriced: true },
        locations: { filteredByWarehouse: true, mismatchedPairRejected: true, mobileMetrics, partyMobileMetrics },
        permissions: { editorCreatedAndEditedParty: true, readerCanRead: true, readerWriteStatus: readerWrite.status },
        organizationSwitch: { listScopeChanged: true, foreignUnitCodeAvailableOnlyInB: foreignUnit.code },
        forcedFallback: fallbackState,
        screenshots,
        runtimeErrors: browserErrors.length,
    };
    process.stdout.write(`${JSON.stringify(acceptanceSummary, null, 2)}\n`);
} finally {
    await restorePartyName();
    cdp?.close();
    if (browserProcess && browserProcess.exitCode === null) {
        browserProcess.kill();
        await Promise.race([new Promise((resolve) => browserProcess.once('exit', resolve)), delay(5000)]);
    }
    await rm(resolvedProfile, { recursive: true, force: true });
}
