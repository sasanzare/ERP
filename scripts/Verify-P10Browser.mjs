import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.P10_BROWSER_BASE_URL ?? 'http://127.0.0.1:8000';
const browserPath = process.env.P10_BROWSER_EXECUTABLE ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const phpPath = process.env.ERP_PHP_BINARY ?? 'C:\\php8.5\\php.exe';
const credentialsPath = path.join(projectRoot, 'storage', 'app', 'private', 'p03-demo-credentials.json');
const screenshotDirectory = path.join(projectRoot, 'docs', 'screenshots');
const profileRoot = path.resolve(projectRoot, 'storage', 'framework', 'testing');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const suffix = Date.now().toString(36).toUpperCase();
const bookCode = process.env.P10_BROWSER_BOOK_CODE ?? `P10-SYNTH-BR-${suffix}`;
const headless = process.env.P10_BROWSER_HEADLESS !== '0';
const keepOpen = process.env.P10_BROWSER_KEEP_OPEN === '1';
const captureOnly = process.env.P10_BROWSER_CAPTURE_ONLY === '1';
const editorCredentials = JSON.parse(await readFile(credentialsPath, 'utf8')).editor;
assert.ok(editorCredentials?.email && editorCredentials?.password, 'Local P03 editor credentials are unavailable.');
await access(browserPath);
await access(phpPath);
await mkdir(profileRoot, { recursive: true });
await mkdir(screenshotDirectory, { recursive: true });

const profileDirectory = await mkdtemp(path.join(profileRoot, 'p10-browser-'));
const resolvedProfile = path.resolve(profileDirectory);
assert.ok(resolvedProfile.startsWith(`${profileRoot}${path.sep}`), 'Browser profile escaped the ignored test directory.');

let browserProcess;
let secondServer;
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
                if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
                    const detail = (message.params.args ?? []).map((item) => item.value ?? item.description ?? '').join(' ');
                    browserErrors.push(`Chrome console error: ${detail}`);
                }
                if (message.method === 'Log.entryAdded' && message.params.entry.source === 'javascript' && message.params.entry.level === 'error') {
                    browserErrors.push(`Chrome log error: ${message.params.entry.text ?? ''}`);
                }
                if (message.method === 'Network.loadingFailed' && message.params.errorText !== 'net::ERR_ABORTED') {
                    browserErrors.push(`Browser request failed: ${message.params.errorText ?? 'unknown error'}`);
                }
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
    const snapshot = await cdp.evaluate(`({ path: location.pathname, title: document.title, body: document.body?.innerText?.slice(0, 500) ?? '' })`);
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
        descriptor?.set?.call(element, ${JSON.stringify(String(value))});
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
    const filename = `p10-${name}-${timestamp}.png`;
    await writeFile(path.join(screenshotDirectory, filename), Buffer.from(image.data, 'base64'));
    screenshots.push({ filename, width, height });
}

async function setViewport(width, height) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await delay(300);
}

async function waitForInvoice(direction, beforeIds, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const result = await browserFetch(`/api/v1/settlements/invoices?direction=${direction}`);
        expectStatus(result, 200, `Read ${direction} invoices`);
        const invoice = result.body.data.find((item) => !beforeIds.has(item.id));
        if (invoice) return invoice;
        await delay(120);
    }
    throw new Error(`The new ${direction} invoice did not appear in the persisted register.`);
}

async function waitForBalance(direction, invoiceId, expectedRial, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const result = await browserFetch(`/api/v1/settlements/invoices?direction=${direction}`);
        expectStatus(result, 200, `Read ${direction} balance`);
        const invoice = result.body.data.find((item) => item.id === invoiceId);
        if (invoice?.outstanding_rial === expectedRial) return invoice;
        await delay(120);
    }
    throw new Error(`Invoice ${invoiceId} did not reach the expected ${expectedRial}-rial balance.`);
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
        cwd: projectRoot, stdio: 'ignore', windowsHide: true,
    });
    const url = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${url}/sign-in`);
            if (response.ok) return url;
        } catch { /* Wait for the independent Laravel worker to start. */ }
        if (secondServer.exitCode !== null) throw new Error(`Second Laravel server exited with code ${secondServer.exitCode}.`);
        await delay(100);
    }
    throw new Error('The second local Laravel server did not start.');
}

async function sessionCookieHeader() {
    const { cookies = [] } = await cdp.send('Network.getAllCookies');
    const local = cookies.filter((cookie) => cookie.domain.includes('127.0.0.1'));
    assert.ok(local.some((cookie) => cookie.name.toLowerCase().includes('session')), 'Chrome did not retain a local session cookie.');

    return local.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

async function requestWithSession(url, cookie, csrf, pathname, body, key) {
    const response = await fetch(`${url}${pathname}`, {
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

    return { status: response.status, body: await response.json().catch(() => null) };
}

async function stopProcess(child) {
    if (!child || child.exitCode !== null) return;
    await new Promise((resolve) => {
        const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 2500);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
        child.kill('SIGTERM');
    });
}

async function startBrowser() {
    const args = [
        '--disable-gpu', '--disable-background-networking', '--disable-sync', '--disable-extensions', '--no-proxy-server',
        '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profileDirectory}`,
        '--window-size=1280,900', 'about:blank',
    ];
    if (headless) args.unshift('--headless=new');
    browserProcess = spawn(browserPath, args, { stdio: 'ignore', windowsHide: headless });
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
    assert.ok(port, 'Chrome did not expose its debugging endpoint.');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find((item) => item.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Chrome did not return a page debugging target.');
    cdp = new CdpPage(page.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Log.enable');
}

async function login() {
    await navigate('/sign-in');
    await waitUntil('sign-in form', () => `Boolean(document.querySelector('#sign-in-email'))`);
    await setInput('#sign-in-email', editorCredentials.email);
    await setInput('#sign-in-password', editorCredentials.password);
    await submitForm('.auth-form');
    await waitUntil('workspace after sign-in', () => `location.pathname === '/products'`);
    await waitUntil('workspace shell', () => `Boolean(document.querySelector('.workspace-account-bar'))`);
    const workspace = await browserFetch('/api/v1/workspace');
    expectStatus(workspace, 200, 'Read active organization');
    const organization = workspace.body.organizations.find((item) => item.name === 'سازمان پیش‌فرض' && item.role === 'editor');
    assert.ok(organization, 'The P03 editor membership for the default organization is unavailable.');
    if (workspace.body.active_organization.id !== organization.id) {
        expectStatus(await browserFetch('/api/v1/active-organization', 'POST', { organization_id: organization.id }), 200, 'Switch active organization');
    }

    return organization;
}

function provisionSyntheticBook(organizationId) {
    const result = spawnSync(phpPath, ['artisan', 'p10:provision-synthetic-profile', String(organizationId), bookCode], {
        cwd: projectRoot, encoding: 'utf8', windowsHide: true,
    });
    if (result.status !== 0) {
        throw new Error(`P10 synthetic profile provisioning failed: ${(result.stderr || result.stdout || '').trim()}`);
    }
}

function customerCandidate(options, excludedOrderId = null) {
    for (const order of options.customer_sources) {
        if (order.id === excludedOrderId) continue;
        for (const line of order.lines) {
            if (line.line_net_toman !== '300000' || line.ordered_quantity !== '3.000') continue;
            for (const delivery of line.deliveries ?? []) {
                if (BigInt(delivery.available_milli) >= 1000n) return { order, line, delivery };
            }
        }
    }
    throw new Error('No P07 source line is available for the 1,000,000-rial synthetic customer example.');
}

function supplierCandidate(options) {
    for (const order of options.supplier_sources) {
        for (const line of order.lines) {
            const available = (line.receipts ?? []).reduce((sum, receipt) => sum + BigInt(receipt.available_milli), 0n);
            if (line.line_total_rial === '500000' && line.ordered_quantity_milli === '5000' && available === 5000n) {
                return { order, line };
            }
        }
    }
    throw new Error('No fully received, unbilled P08 source line is available for the 500,000-rial synthetic supplier example.');
}

async function invoiceList(direction) {
    const result = await browserFetch(`/api/v1/settlements/invoices?direction=${direction}`);
    expectStatus(result, 200, `Read ${direction} invoice register`);
    return result.body.data;
}

async function assertBalancedJournal(journalId, label) {
    const result = await browserFetch(`/api/v1/accounting/journals/${journalId}`);
    expectStatus(result, 200, `Read ${label} journal`);
    assert.equal(result.body.data.status, 'posted', `${label} journal is not posted.`);
    assert.equal(result.body.data.debit_total_rial, result.body.data.credit_total_rial, `${label} journal is unbalanced.`);

    return result.body.data;
}

async function checkMobileGeometry(direction, invoiceId) {
    await cdp.evaluate(`document.querySelector('[data-testid="settlement-invoice-${direction}-${invoiceId}"]')?.scrollIntoView({ block: 'center' })`);
    await delay(250);
    await cdp.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
    await delay(250);
    const metrics = await cdp.evaluate(`(() => {
        const content = document.querySelector('.settlement-focus');
        const dock = document.querySelector('.mobile-focus-dock');
        const contentRect = content?.getBoundingClientRect();
        const dockRect = dock?.getBoundingClientRect();
        return {
            innerWidth: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            contentBottom: contentRect?.bottom ?? null,
            dockTop: dockRect?.top ?? null,
            dockGap: contentRect && dockRect ? dockRect.top - contentRect.bottom : null,
            dockVisible: Boolean(dockRect && dockRect.top < window.innerHeight && dockRect.bottom > 0),
        };
    })()`);
    assert.ok(metrics.documentWidth <= metrics.clientWidth, `Mobile page overflows horizontally: ${JSON.stringify(metrics)}`);
    assert.ok(metrics.dockVisible, `Mobile dock is outside the viewport: ${JSON.stringify(metrics)}`);
    assert.ok((metrics.dockGap ?? -1) >= 0, `Settlement content overlaps the mobile dock: ${JSON.stringify(metrics)}`);

    return metrics;
}

let summary;
try {
    await startBrowser();
    await login();
    const workspace = await browserFetch('/api/v1/workspace');
    const organization = workspace.body.active_organization;
    provisionSyntheticBook(organization.id);
    await navigate('/settlements');
    await waitUntil('settlement workspace', () => `Boolean(document.querySelector('.settlement-layout'))`);

    const optionsResponse = await browserFetch('/api/v1/settlements/options');
    expectStatus(optionsResponse, 200, 'Read P10 options');
    const book = optionsResponse.body.data.books.find((item) => item.code === bookCode);
    assert.ok(book?.posting_ready, 'P10 synthetic book is not posting-ready.');
    const viteAssetsBefore = await cdp.evaluate('performance.getEntriesByType("resource").map((item) => item.name)');
    const viteClientLoaded = viteAssetsBefore.some((item) => item.includes(':5173/@vite/client'));
    const settlementStyleLoaded = viteAssetsBefore.some((item) => item.includes('settlements.css'));
    assert.equal(viteClientLoaded, true, 'The live route did not load the Vite client.');
    assert.equal(settlementStyleLoaded, true, 'Vite did not resolve settlements.css on the live route.');

    if (captureOnly) {
        const existingCustomer = (await invoiceList('customer')).find((item) => item.book.code === bookCode && item.outstanding_rial === '600000');
        const existingSupplier = (await invoiceList('supplier')).find((item) => item.book.code === bookCode && item.outstanding_rial === '300000');
        const existingRace = (await invoiceList('customer')).find((item) => item.book.code === bookCode && item.outstanding_rial === '200000');
        assert.ok(existingCustomer, 'No 600,000-rial customer readback is available for screenshot capture.');
        assert.ok(existingSupplier, 'No 300,000-rial supplier readback is available for screenshot capture.');
        assert.ok(existingRace, 'No serialized-overallocation readback is available for screenshot capture.');
        const linkedJournals = [existingCustomer, existingRace, existingSupplier].flatMap((invoice) => [
            invoice.journal?.id,
            ...invoice.allocations.map((allocation) => allocation.treasury_movement?.journal?.id),
        ]).filter((id) => Number.isInteger(id));
        for (const [index, journalId] of [...new Set(linkedJournals)].entries()) {
            await assertBalancedJournal(journalId, `P10 linked ${index + 1}`);
        }

        await waitUntil('customer review card', () => `Boolean(document.querySelector('[data-testid="settlement-invoice-customer-${existingCustomer.id}"]'))`);
        await cdp.evaluate(`document.querySelector('[data-testid="settlement-invoice-customer-${existingCustomer.id}"]')?.scrollIntoView({ block: 'center' })`);
        await captureScreenshot('customer-settled-review-desktop', 1280, 900);
        await waitUntil('supplier tab for review', () => `Boolean(document.querySelector('.settlement-tabs button:nth-child(2)'))`);
        await click('.settlement-tabs button:nth-child(2)');
        await waitUntil('supplier review card', () => `Boolean(document.querySelector('[data-testid="settlement-invoice-supplier-${existingSupplier.id}"]'))`);
        await cdp.evaluate(`document.querySelector('[data-testid="settlement-invoice-supplier-${existingSupplier.id}"]')?.scrollIntoView({ block: 'center' })`);
        await captureScreenshot('supplier-settled-review-desktop', 1280, 900);
        await setViewport(390, 844);
        await cdp.evaluate(`document.querySelector('[data-testid="settlement-invoice-supplier-${existingSupplier.id}"]')?.scrollIntoView({ block: 'center' })`);
        await captureScreenshot('supplier-settled-review-mobile', 390, 844);
        const supplierMobile = await checkMobileGeometry('supplier', existingSupplier.id);

        await navigate('/settlements');
        await waitUntil('customer mobile review card', () => `Boolean(document.querySelector('[data-testid="settlement-invoice-customer-${existingCustomer.id}"]'))`);
        await setViewport(390, 844);
        await cdp.evaluate(`document.querySelector('[data-testid="settlement-invoice-customer-${existingCustomer.id}"]')?.scrollIntoView({ block: 'center' })`);
        await captureScreenshot('customer-settled-review-mobile', 390, 844);
        const customerMobile = await checkMobileGeometry('customer', existingCustomer.id);

        await navigate('/settlements?glass=fallback&scene=bright');
        await waitUntil('bright fallback review card', () => `Boolean(document.querySelector('[data-testid="settlement-invoice-customer-${existingCustomer.id}"]'))`);
        await setViewport(390, 844);
        await cdp.evaluate(`document.querySelector('[data-testid="settlement-invoice-customer-${existingCustomer.id}"]')?.scrollIntoView({ block: 'center' })`);
        const fallback = await cdp.evaluate(`(() => {
            const surfaces = [...document.querySelectorAll('.lg-surface')];
            const activeRefractionSurfaces = surfaces.filter((item) => item.classList.contains('lg-map-ready')
                && getComputedStyle(item).getPropertyValue('--lg-filter-url').trim() !== 'none').length;
            return { surfaces: surfaces.length, activeRefractionSurfaces, brightScene: document.documentElement.dataset.lgScene === 'bright' };
        })()`);
        assert.equal(fallback.brightScene, true);
        assert.ok(fallback.surfaces > 0);
        assert.equal(fallback.activeRefractionSurfaces, 0);
        await cdp.evaluate('document.querySelector(".settlement-tabs button:first-child")?.focus()');
        await pressKey('Tab');
        const visibleFocus = await cdp.evaluate(`Boolean(document.activeElement?.matches(':focus-visible'))`);
        assert.equal(visibleFocus, true, 'Keyboard focus is not visible in the fallback view.');
        await captureScreenshot('settlement-bright-fallback-review-mobile', 390, 844);
        assert.equal(browserErrors.length, 0, `Chrome reported runtime or network errors: ${browserErrors.join('; ')}`);

        summary = {
            organizationId: organization.id,
            bookId: book.id,
            bookCode,
            customer: { invoiceId: existingCustomer.id, sourceOrderId: existingCustomer.source.id, amountRial: existingCustomer.amount_rial, allocatedRial: existingCustomer.allocated_rial, outstandingRial: existingCustomer.outstanding_rial, outstandingToman: existingCustomer.outstanding_toman },
            supplier: { invoiceId: existingSupplier.id, sourceOrderId: existingSupplier.source.id, amountRial: existingSupplier.amount_rial, allocatedRial: existingSupplier.allocated_rial, outstandingRial: existingSupplier.outstanding_rial },
            contention: { invoiceId: existingRace.id, allocatedRial: existingRace.allocated_rial, outstandingRial: existingRace.outstanding_rial },
            mobile: { customer: customerMobile, supplier: supplierMobile },
            visibleFocus,
            forcedFallback: fallback,
            liveVite: { clientLoaded: viteClientLoaded, settlementStyleLoaded },
            screenshots,
            runtimeErrors: browserErrors.length,
            capturedExistingRecordsOnly: true,
        };
    } else {
    const customer = customerCandidate(optionsResponse.body.data);
    const beforeCustomer = await invoiceList('customer');
    const customerIdsBefore = new Set(beforeCustomer.map((item) => item.id));
    await setSelect('#settlement-book', book.id);
    await setSelect('#settlement-source', customer.order.id);
    await waitUntil('customer delivery input', () => `Boolean(document.querySelector('#settlement-qty-customer-${customer.delivery.id}'))`);
    await setInput(`#settlement-qty-customer-${customer.delivery.id}`, '1.000');
    await setInput('#settlement-effective-on', '2026-11-24');
    await setInput('#settlement-due-on', '2026-12-24');
    await submitForm('[data-testid="settlement-invoice-form"]');
    const customerDeadline = Date.now() + 20000;
    let customerInvoice;
    while (Date.now() < customerDeadline) {
        const list = await invoiceList('customer');
        customerInvoice = list.find((item) => !customerIdsBefore.has(item.id));
        if (customerInvoice) break;
        await delay(150);
    }
    assert.ok(customerInvoice, 'Customer invoice did not appear after submitting the UI form.');
    assert.equal(customerInvoice.amount_rial, '1000000');
    assert.equal(customerInvoice.amount_toman, '100000');
    assert.equal(customerInvoice.lines[0].source.id, customer.delivery.id);
    await waitUntil('customer invoice card', () => `Boolean(document.querySelector('[data-testid="settlement-invoice-customer-${customerInvoice.id}"]'))`);
    await captureScreenshot('customer-invoice-desktop', 1280, 900);

    await setInput(`#settlement-amount-${customerInvoice.id}`, '400000');
    await setInput(`#settlement-date-${customerInvoice.id}`, '2026-11-24');
    await submitForm(`[data-testid="settlement-payment-form-${customerInvoice.id}"]`);
    customerInvoice = await waitForBalance('customer', customerInvoice.id, '600000');
    assert.equal(customerInvoice.outstanding_toman, '60000');
    assert.equal(customerInvoice.allocations.reduce((sum, allocation) => sum + BigInt(allocation.amount_rial), 0n).toString(), '400000');
    assert.ok(customerInvoice.allocations[0].treasury_movement?.journal, 'Customer receipt is missing its linked treasury journal.');
    await navigate('/settlements');
    await waitUntil('refreshed settlement workspace', () => `Boolean(document.querySelector('[data-testid="settlement-invoice-customer-${customerInvoice.id}"]'))`);
    const refreshedCustomer = (await invoiceList('customer')).find((item) => item.id === customerInvoice.id);
    assert.equal(refreshedCustomer?.outstanding_rial, '600000', 'Customer balance changed after browser refresh.');
    await captureScreenshot('customer-settled-desktop', 1280, 900);

    const raceOptionsResponse = await browserFetch('/api/v1/settlements/options');
    expectStatus(raceOptionsResponse, 200, 'Read customer sources for contention');
    const raceSource = customerCandidate(raceOptionsResponse.body.data, customer.order.id);
    const raceInvoiceResponse = await browserFetch(`/api/v1/settlements/sales-orders/${raceSource.order.id}/customer-invoices`, 'POST', {
        book_id: book.id,
        effective_on: '2026-11-24',
        due_on: '2026-12-24',
        lines: [{ sales_order_line_id: raceSource.line.id, sales_order_delivery_id: raceSource.delivery.id, quantity_milli: '1000' }],
    }, { 'Idempotency-Key': uuid() });
    expectStatus(raceInvoiceResponse, 201, 'Create the synthetic contention invoice');
    const raceInvoice = raceInvoiceResponse.body.data;
    assert.equal(raceInvoice.amount_rial, '1000000');
    const preRaceReceipt = await browserFetch(`/api/v1/settlements/customer-invoices/${raceInvoice.id}/receipts`, 'POST', {
        amount_rial: '400000', effective_on: '2026-11-24', reference: 'P10 synthetic contention base receipt',
    }, { 'Idempotency-Key': uuid() });
    expectStatus(preRaceReceipt, 201, 'Create the base receipt for contention');
    assert.equal(preRaceReceipt.body.invoice.outstanding_rial, '600000');
    const independentServerUrl = await startSecondServer();
    const cookie = await sessionCookieHeader();
    const csrf = await cdp.evaluate(`document.querySelector('meta[name="csrf-token"]')?.content ?? ''`);
    assert.ok(csrf, 'P10 contention session has no CSRF token.');
    const racePath = `/api/v1/settlements/customer-invoices/${raceInvoice.id}/receipts`;
    const raceInput = { amount_rial: '400000', effective_on: '2026-11-24', reference: 'P10 parallel receipt' };
    const raceResults = await Promise.all([
        requestWithSession(baseUrl, cookie, csrf, racePath, raceInput, uuid()),
        requestWithSession(independentServerUrl, cookie, csrf, racePath, raceInput, uuid()),
    ]);
    const raceStatuses = raceResults.map((result) => result.status).sort((left, right) => left - right);
    assert.deepEqual(raceStatuses, [201, 422], `The open item was not serialized: ${JSON.stringify(raceResults)}`);
    const raceReadback = (await invoiceList('customer')).find((item) => item.id === raceInvoice.id);
    assert.ok(raceReadback, 'The P10 contention invoice disappeared from the persisted register.');
    assert.equal(raceReadback?.allocated_rial, '800000');
    assert.equal(raceReadback?.outstanding_rial, '200000');
    assert.equal(raceReadback?.allocations.length, 2);

    await click('.settlement-tabs button:nth-child(2)');
    await waitUntil('supplier source selector', () => `Boolean(document.querySelector('#settlement-source'))`);
    const supplierOptions = await browserFetch('/api/v1/settlements/options');
    expectStatus(supplierOptions, 200, 'Read supplier sources');
    const supplier = supplierCandidate(supplierOptions.body.data);
    const beforeSupplier = await invoiceList('supplier');
    const supplierIdsBefore = new Set(beforeSupplier.map((item) => item.id));
    await setSelect('#settlement-book', book.id);
    await setSelect('#settlement-source', supplier.order.id);
    const expectedReceiptIds = supplier.line.receipts.map((receipt) => receipt.id);
    await waitUntil('supplier receipt controls', () => `document.querySelectorAll('[id^="settlement-qty-supplier-"]').length >= ${expectedReceiptIds.length}`);
    await setInput('#settlement-effective-on', '2026-11-24');
    await setInput('#settlement-due-on', '2026-12-24');
    await submitForm('[data-testid="settlement-invoice-form"]');
    const supplierDeadline = Date.now() + 20000;
    let supplierInvoice;
    while (Date.now() < supplierDeadline) {
        const list = await invoiceList('supplier');
        supplierInvoice = list.find((item) => !supplierIdsBefore.has(item.id));
        if (supplierInvoice) break;
        await delay(150);
    }
    assert.ok(supplierInvoice, 'Supplier invoice did not appear after submitting the UI form.');
    assert.equal(supplierInvoice.amount_rial, '500000');
    assert.deepEqual(supplierInvoice.lines.map((line) => line.source.id).sort((a, b) => a - b), expectedReceiptIds.sort((a, b) => a - b));
    assert.equal(supplierInvoice.journal?.debit_total_rial, '500000');
    assert.equal(supplierInvoice.journal?.credit_total_rial, '500000');
    await waitUntil('supplier invoice card', () => `Boolean(document.querySelector('[data-testid="settlement-invoice-supplier-${supplierInvoice.id}"]'))`);
    await captureScreenshot('supplier-invoice-desktop', 1280, 900);

    await setInput(`#settlement-amount-${supplierInvoice.id}`, '200000');
    await setInput(`#settlement-date-${supplierInvoice.id}`, '2026-11-24');
    await submitForm(`[data-testid="settlement-payment-form-${supplierInvoice.id}"]`);
    supplierInvoice = await waitForBalance('supplier', supplierInvoice.id, '300000');
    assert.equal(supplierInvoice.allocations.reduce((sum, allocation) => sum + BigInt(allocation.amount_rial), 0n).toString(), '200000');
    assert.ok(supplierInvoice.allocations[0].treasury_movement?.journal, 'Supplier payment is missing its linked treasury journal.');
    await navigate('/settlements');
    await waitUntil('supplier tab after refresh', () => `Boolean(document.querySelector('.settlement-tabs button:nth-child(2)'))`);
    await click('.settlement-tabs button:nth-child(2)');
    await waitUntil('refreshed supplier invoice card', () => `Boolean(document.querySelector('[data-testid="settlement-invoice-supplier-${supplierInvoice.id}"]'))`);
    const refreshedSupplier = (await invoiceList('supplier')).find((item) => item.id === supplierInvoice.id);
    assert.equal(refreshedSupplier?.outstanding_rial, '300000', 'Supplier balance changed after browser refresh.');
    await captureScreenshot('supplier-settled-desktop', 1280, 900);
    await setViewport(390, 844);
    await cdp.evaluate(`document.querySelector('[data-testid="settlement-invoice-supplier-${supplierInvoice.id}"]')?.scrollIntoView({ block: 'center' })`);
    await captureScreenshot('supplier-settled-mobile', 390, 844);
    const supplierMobileMetrics = await checkMobileGeometry('supplier', supplierInvoice.id);

    await navigate('/settlements');
    await waitUntil('customer mobile workspace', () => `Boolean(document.querySelector('[data-testid="settlement-invoice-customer-${customerInvoice.id}"]'))`);
    await setViewport(390, 844);
    await cdp.evaluate(`document.querySelector('[data-testid="settlement-invoice-customer-${customerInvoice.id}"]')?.scrollIntoView({ block: 'center' })`);
    await captureScreenshot('customer-settled-mobile', 390, 844);
    const mobileMetrics = await checkMobileGeometry('customer', customerInvoice.id);

    await navigate('/settlements?glass=fallback&scene=bright');
    await waitUntil('bright fallback settlement workspace', () => `Boolean(document.querySelector('[data-testid="settlement-invoice-customer-${customerInvoice.id}"]'))`);
    await setViewport(390, 844);
    await cdp.evaluate(`document.querySelector('[data-testid="settlement-invoice-customer-${customerInvoice.id}"]')?.scrollIntoView({ block: 'center' })`);
    const fallback = await cdp.evaluate(`(() => {
        const surfaces = [...document.querySelectorAll('.lg-surface')];
        const activeRefractionSurfaces = surfaces.filter((item) => item.classList.contains('lg-map-ready')
            && getComputedStyle(item).getPropertyValue('--lg-filter-url').trim() !== 'none').length;
        return {
            surfaces: surfaces.length,
            activeRefractionSurfaces,
            brightScene: document.documentElement.dataset.lgScene === 'bright',
        };
    })()`);
    assert.equal(fallback.brightScene, true);
    assert.ok(fallback.surfaces > 0, 'The fallback did not render shared glass surfaces.');
    assert.equal(fallback.activeRefractionSurfaces, 0, 'Forced fallback unexpectedly applied SVG refraction.');

    await click('.settlement-tabs button:first-child');
    await cdp.evaluate('document.querySelector(".settlement-tabs button:first-child")?.focus()');
    await pressKey('Tab');
    const visibleFocus = await cdp.evaluate(`(() => ({
        visible: Boolean(document.activeElement?.matches(':focus-visible')),
        tag: document.activeElement?.tagName ?? null,
        label: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim() ?? null,
    }))()`);
    assert.equal(visibleFocus.visible, true, 'Keyboard focus is not visible on the settlement screen.');
    await captureScreenshot('settlement-bright-fallback-mobile', 390, 844);
    assert.equal(browserErrors.length, 0, `Chrome reported runtime or network errors: ${browserErrors.join('; ')}`);

    summary = {
        organizationId: organization.id,
        bookId: book.id,
        bookCode,
        customer: {
            invoiceId: customerInvoice.id,
            sourceOrderId: customerInvoice.source.id,
            deliveryId: customerInvoice.lines[0].source.id,
            invoiceJournalId: customerInvoice.journal?.id,
            receiptId: customerInvoice.allocations[0].treasury_movement?.id,
            receiptJournalId: customerInvoice.allocations[0].treasury_movement?.journal?.id,
            amountRial: customerInvoice.amount_rial,
            allocatedRial: customerInvoice.allocated_rial,
            outstandingRial: customerInvoice.outstanding_rial,
            outstandingToman: customerInvoice.outstanding_toman,
        },
        contention: {
            invoiceId: raceInvoice.id,
            statuses: raceStatuses,
            persistedAllocationTotal: raceReadback.allocated_rial,
            outstandingRial: raceReadback.outstanding_rial,
        },
        supplier: {
            invoiceId: supplierInvoice.id,
            sourceOrderId: supplierInvoice.source.id,
            receiptIds: supplierInvoice.lines.map((line) => line.source.id),
            invoiceJournalId: supplierInvoice.journal?.id,
            paymentId: supplierInvoice.allocations[0].treasury_movement?.id,
            paymentJournalId: supplierInvoice.allocations[0].treasury_movement?.journal?.id,
            amountRial: supplierInvoice.amount_rial,
            allocatedRial: supplierInvoice.allocated_rial,
            outstandingRial: supplierInvoice.outstanding_rial,
        },
        mobile: { customer: mobileMetrics, supplier: supplierMobileMetrics },
        visibleFocus,
        forcedFallback: fallback,
        liveVite: { clientLoaded: viteClientLoaded, settlementStyleLoaded },
        screenshots,
        runtimeErrors: browserErrors.length,
    };
    }
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
    runFailure = error;
    throw error;
} finally {
    await stopProcess(secondServer);
    cdp?.close();
    if (keepOpen && runFailure === null) {
        browserProcess?.unref();
        process.stdout.write(`Chrome remains open for review; temporary profile: ${resolvedProfile}\n`);
    } else {
        if (browserProcess && browserProcess.exitCode === null) browserProcess.kill();
        if (resolvedProfile.startsWith(`${profileRoot}${path.sep}`)) {
            try { await rm(resolvedProfile, { recursive: true, force: true }); } catch { /* Preserve an in-use diagnostic profile. */ }
        }
    }
}
