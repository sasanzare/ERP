import assert from 'node:assert/strict';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.P11_BROWSER_BASE_URL ?? 'http://127.0.0.1:8000';
const browserPath = process.env.P11_BROWSER_EXECUTABLE ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const credentialsPath = path.join(projectRoot, 'storage', 'app', 'private', 'p03-demo-credentials.json');
const screenshotDirectory = path.join(projectRoot, 'docs', 'screenshots');
const profileRoot = path.resolve(os.tmpdir(), 'erp-p11-browser');
const timestamp = process.env.P11_SCREENSHOT_STAMP ?? new Date().toISOString().replace(/[:.]/g, '-');
const headless = process.env.P11_BROWSER_HEADLESS !== '0';
const keepOpen = process.env.P11_BROWSER_KEEP_OPEN === '1';
const captureImages = process.env.P11_CAPTURE_SCREENSHOTS !== '0';
const editorCredentials = JSON.parse(await readFile(credentialsPath, 'utf8')).editor;
assert.ok(editorCredentials?.email && editorCredentials?.password, 'Local P03 editor credentials are unavailable.');
await access(browserPath);
await mkdir(profileRoot, { recursive: true });
await mkdir(screenshotDirectory, { recursive: true });

const profileDirectory = await mkdtemp(path.join(profileRoot, 'p11-browser-'));
const resolvedProfile = path.resolve(profileDirectory);
assert.ok(resolvedProfile.startsWith(`${profileRoot}${path.sep}`), 'Browser profile escaped the P11 temporary-profile directory.');

let browserProcess;
let cdp;
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
    await delay(300);
    if (!captureImages) return;
    const image = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    const filename = `p11-${name}-${timestamp}.png`;
    await writeFile(path.join(screenshotDirectory, filename), Buffer.from(image.data, 'base64'));
    screenshots.push({ filename, width, height });
}

async function setViewport(width, height) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await delay(250);
}

async function startBrowser() {
    const args = [
        '--disable-gpu', '--disable-background-networking', '--disable-sync', '--disable-extensions', '--no-proxy-server',
        '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profileDirectory}`,
        '--window-size=1280,900', 'about:blank',
    ];
    if (headless) args.unshift('--headless=new');
    browserProcess = spawn(browserPath, args, { stdio: 'ignore', windowsHide: true });
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
    const target = targets.find((item) => item.type === 'page');
    assert.ok(target?.webSocketDebuggerUrl, 'Chrome did not return a page debugging target.');
    cdp = new CdpPage(target.webSocketDebuggerUrl);
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
    assert.ok(organization, 'P11 requires the local editor membership for legacy-local.');
    if (workspace.body.active_organization.id !== organization.id) {
        expectStatus(await browserFetch('/api/v1/active-organization', 'POST', { organization_id: organization.id }), 200, 'Switch active organization');
    }

    return organization;
}

async function openDashboard(bookId, reportDate, currency = 'IRR', metric = undefined) {
    const query = new URLSearchParams({ book_id: String(bookId), as_of_date: reportDate, currency });
    if (metric) query.set('metric', metric);
    await navigate(`/dashboard?${query.toString()}`);
    await waitUntil('P11 dashboard', () => `Boolean(document.querySelector('[data-testid="p11-dashboard"], [data-testid="p11-detail-view"]'))`);
    await waitUntil('P11 financial value', () => `Boolean(document.querySelector('[data-testid="p11-net-sales-value"]'))`);
}

async function checkMobileGeometry() {
    await cdp.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
    await delay(200);
    return cdp.evaluate(`(() => {
        const stage = document.querySelector('[data-lg-role="stage"]');
        const focus = document.querySelector('.p11-report-surface');
        const dock = document.querySelector('.mobile-focus-dock');
        const focusRect = focus?.getBoundingClientRect();
        const dockRect = dock?.getBoundingClientRect();
        return {
            documentWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            focusBottom: focusRect?.bottom ?? null,
            dockTop: dockRect?.top ?? null,
            dockGap: focusRect && dockRect ? dockRect.top - focusRect.bottom : null,
            dockVisible: Boolean(dockRect && dockRect.top < innerHeight && dockRect.bottom > 0),
            stageRole: stage?.dataset.lgRole ?? null,
        };
    })()`);
}

async function captureMetricDetails(metric, bookId, reportDate, expectedRows) {
    await openDashboard(bookId, reportDate);
    const selector = `[data-testid="p11-tile-${metric}"] .p11-drill-link`;
    const href = await cdp.evaluate(`document.querySelector(${JSON.stringify(selector)})?.getAttribute('href') ?? null`);
    assert.ok(href, `Tile ${metric} has no drill-down link.`);
    const link = new URL(href, baseUrl);
    assert.equal(link.searchParams.get('book_id'), String(bookId));
    assert.equal(link.searchParams.get('as_of_date'), reportDate);
    assert.equal(link.searchParams.get('currency'), 'IRR');
    await click(selector);
    await waitUntil(`${metric} detail`, () => `location.search.includes('metric=${metric}') && Boolean(document.querySelector('[data-testid="p11-detail-view"]'))`);
    const detail = await cdp.evaluate(`(() => ({
        metric: new URLSearchParams(location.search).get('metric'),
        rows: document.querySelectorAll('.p11-table tbody tr').length,
        total: document.querySelector('[data-testid="p11-detail-count"]')?.textContent ?? '',
        hasTable: Boolean(document.querySelector('.p11-table')),
    }))()`);
    assert.equal(detail.metric, metric);
    assert.equal(detail.rows, expectedRows, `${metric} detail row count did not reconcile.`);
    assert.equal(detail.hasTable, expectedRows > 0);
    return detail;
}

let summary;
try {
    await startBrowser();
    const organization = await login();
    const optionResponse = await browserFetch('/api/v1/dashboard/options');
    expectStatus(optionResponse, 200, 'Read P11 options');
    const options = optionResponse.body.data;
    const book = options.books.find((item) => item.code === 'P10-SYNTH-BROWSER');
    assert.ok(book, 'The existing P10-SYNTH-BROWSER book is not available in the selected organization.');
    const reportDate = process.env.P11_AS_OF_DATE ?? options.default_as_of_date;
    assert.ok(reportDate, 'The P11 report default date is unavailable.');

    await openDashboard(book.id, reportDate);
    const assets = await cdp.evaluate('performance.getEntriesByType("resource").map((item) => item.name)');
    const viteClientLoaded = assets.some((item) => item.includes(':5173/@vite/client'));
    const dashboardStyleLoaded = assets.some((item) => item.includes('dashboard.css'));
    assert.equal(viteClientLoaded, true, 'The live dashboard route did not load the Vite client.');
    assert.equal(dashboardStyleLoaded, true, 'The live dashboard route did not resolve dashboard.css.');

    const summaryResponse = await browserFetch(`/api/v1/dashboard?book_id=${book.id}&as_of_date=${reportDate}&currency=IRR`);
    expectStatus(summaryResponse, 200, 'Read P11 metrics');
    const observed = summaryResponse.body.data;
    assert.equal(observed.organization_id, organization.id);
    assert.equal(observed.book.id, book.id);
    assert.equal(observed.as_of_date, reportDate);
    assert.equal(observed.book.time_zone, 'Asia/Tehran');
    assert.equal(observed.metrics.net_sales.total_rial, '5000000');
    assert.equal(observed.metrics.overdue_receivables.total_rial, '600000');
    assert.deepEqual(observed.metrics.available_stock.unit_totals.map((item) => ({ code: item.unit.code, quantity: item.quantity })), [{ code: 'EA', quantity: '131.500' }]);
    assert.equal(observed.metrics.available_stock.record_count, 15);
    assert.equal(observed.metrics.pending_purchase_approvals.count, 1);

    const rendered = await cdp.evaluate(`(() => ({
        net: document.querySelector('[data-testid="p11-net-sales-value"]')?.textContent?.trim(),
        overdue: document.querySelector('[data-testid="p11-overdue-value"]')?.textContent?.trim(),
        stock: document.querySelector('[data-testid="p11-stock-value"]')?.textContent?.trim(),
        approvals: document.querySelector('[data-testid="p11-approvals-value"]')?.textContent?.trim(),
    }))()`);
    assert.equal(rendered.net, '۵٬۰۰۰٬۰۰۰');
    assert.equal(rendered.overdue, '۶۰۰٬۰۰۰');
    assert.ok(rendered.stock?.includes('۱۳۱٫۵۰۰'));
    assert.equal(rendered.approvals, '۱');
    await captureScreenshot('dashboard-desktop', 1280, 900);

    const netDetails = await captureMetricDetails('net-sales', book.id, reportDate, 5);
    const overdueDetails = await captureMetricDetails('overdue-receivables', book.id, reportDate, 1);
    await captureScreenshot('overdue-details-desktop', 1280, 900);
    const stockDetails = await captureMetricDetails('available-stock', book.id, reportDate, 15);
    const approvalsDetails = await captureMetricDetails('pending-purchase-approvals', book.id, reportDate, 1);

    const boundarySummaries = {};
    for (const [date, expectedOverdue] of [['2026-11-24', '0'], ['2026-11-25', '1000000'], ['2026-11-26', '600000']]) {
        const result = await browserFetch(`/api/v1/dashboard?book_id=${book.id}&as_of_date=${date}&currency=IRR`);
        expectStatus(result, 200, `Read cutoff boundary ${date}`);
        const total = result.body.data.metrics.overdue_receivables.total_rial;
        assert.equal(total, expectedOverdue, `Overdue balance boundary ${date} did not match.`);
        boundarySummaries[date] = total;
    }

    const slowFetchScript = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `(() => {
            const originalFetch = window.fetch.bind(window);
            window.__p11OriginalFetch = originalFetch;
            window.fetch = (input, init) => {
                const url = typeof input === 'string' ? input : input.url;
                if (url.includes('/api/v1/workspace') || url.includes('/api/v1/dashboard')) {
                    return new Promise((resolve, reject) => setTimeout(() => originalFetch(input, init).then(resolve, reject), 1200));
                }
                return originalFetch(input, init);
            };
        })();`,
    });
    await navigate(`/dashboard?book_id=${book.id}&as_of_date=${reportDate}&currency=IRR`);
    const loadingText = await waitUntil('P11 loading state', () => `document.querySelector('.p11-standalone-state')?.textContent?.trim() ?? null`);
    assert.ok(loadingText.includes('در حال آماده‌سازی'));
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: slowFetchScript.identifier });
    await waitUntil('P11 dashboard after delayed requests', () => `Boolean(document.querySelector('[data-testid="p11-dashboard"]'))`);
    await cdp.evaluate('if (window.__p11OriginalFetch) { window.fetch = window.__p11OriginalFetch; delete window.__p11OriginalFetch; }');

    await navigate(`/dashboard?book_id=${book.id}&as_of_date=2026-99-99&currency=IRR`);
    await waitUntil('P11 error state', () => `Boolean(document.querySelector('.p11-state-panel[role="alert"]'))`);
    const errorState = await cdp.evaluate(`document.querySelector('.p11-state-panel[role="alert"]')?.innerText ?? ''`);
    assert.ok(errorState.includes('گزارش بارگذاری نشد'));

    await navigate(`/dashboard?book_id=${book.id}&as_of_date=2020-01-01&currency=IRR&metric=net-sales`);
    await waitUntil('P11 empty source state', () => `Boolean(document.querySelector('[data-testid="p11-detail-view"] .p11-empty[role="status"]'))`);
    const emptyState = await cdp.evaluate(`document.querySelector('[data-testid="p11-detail-view"] .p11-empty')?.innerText ?? ''`);
    assert.ok(emptyState.includes('ردیفی در این گروه نیست'));

    const salesOrdersResponse = await browserFetch('/api/v1/sales-orders');
    expectStatus(salesOrdersResponse, 200, 'Read confirmed sale orders');
    const saleOrder = salesOrdersResponse.body.data.find((item) => item.lead.title === 'P11 walkthrough sale');
    assert.ok(saleOrder, 'The P11 walkthrough confirmed sales order is not visible in the sales register.');
    const saleOrderDetailResponse = await browserFetch(`/api/v1/sales-orders/${saleOrder.id}`);
    expectStatus(saleOrderDetailResponse, 200, 'Read P11 sale order');
    const saleOrderDetail = saleOrderDetailResponse.body.data;
    assert.equal(saleOrderDetail.status, 'confirmed');
    assert.equal(saleOrderDetail.lines[0].product_code, 'P11-WALKTHROUGH-ITEM');
    assert.equal(saleOrderDetail.lines[0].fulfillment.deliveries.length, 1);

    const purchaseRequestsResponse = await browserFetch('/api/v1/purchase-requests');
    expectStatus(purchaseRequestsResponse, 200, 'Read purchase requests');
    const purchaseRequest = purchaseRequestsResponse.body.data.find((item) => item.title === 'P11 walkthrough purchase');
    const pendingRequest = purchaseRequestsResponse.body.data.find((item) => item.title === 'P11 dashboard pending approval');
    assert.ok(purchaseRequest, 'The P11 purchase request is not visible in the request register.');
    assert.ok(pendingRequest, 'The P11 pending request is not visible in the request register.');
    assert.equal(purchaseRequest.status, 'approved');
    assert.ok(purchaseRequest.approved_by, 'The purchase approval has no actor.');

    const purchaseOrdersResponse = await browserFetch('/api/v1/purchase-orders');
    expectStatus(purchaseOrdersResponse, 200, 'Read purchase orders');
    const purchaseOrder = purchaseOrdersResponse.body.data.find((item) => item.source_request.id === purchaseRequest.id);
    assert.ok(purchaseOrder, 'The P11 purchase order is not linked to its request.');
    const purchaseOrderDetailResponse = await browserFetch(`/api/v1/purchase-orders/${purchaseOrder.id}`);
    expectStatus(purchaseOrderDetailResponse, 200, 'Read P11 purchase order');
    const purchaseOrderDetail = purchaseOrderDetailResponse.body.data;
    assert.equal(purchaseOrderDetail.status, 'closed');
    assert.equal(purchaseOrderDetail.total_rial, '500000');
    assert.equal(purchaseOrderDetail.lines[0].receipts.length, 1);

    const customerInvoicesResponse = await browserFetch('/api/v1/settlements/invoices?direction=customer');
    expectStatus(customerInvoicesResponse, 200, 'Read customer invoice register');
    const customerInvoice = customerInvoicesResponse.body.data.find((item) => item.source.id === saleOrder.id);
    const supplierInvoicesResponse = await browserFetch('/api/v1/settlements/invoices?direction=supplier');
    expectStatus(supplierInvoicesResponse, 200, 'Read supplier invoice register');
    const supplierInvoice = supplierInvoicesResponse.body.data.find((item) => item.source.id === purchaseOrder.id);
    assert.ok(customerInvoice, 'The P11 customer invoice is not linked to its sales order.');
    assert.ok(supplierInvoice, 'The P11 supplier invoice is not linked to its purchase order.');
    assert.equal(customerInvoice.amount_rial, '1000000');
    assert.equal(customerInvoice.allocated_rial, '400000');
    assert.equal(customerInvoice.outstanding_rial, '600000');
    assert.equal(supplierInvoice.amount_rial, '500000');
    assert.equal(supplierInvoice.allocated_rial, '200000');
    assert.equal(supplierInvoice.outstanding_rial, '300000');

    await navigate(`/orders/${saleOrder.id}`);
    await waitUntil('P11 confirmed sales order view', () => `document.body.innerText.includes(${JSON.stringify(saleOrder.code)})`);
    const saleOrderView = await cdp.evaluate('document.body.innerText');
    assert.ok(saleOrderView.includes('P11-WALKTHROUGH-ITEM'));
    const saleMovementId = saleOrderDetail.lines[0].fulfillment.deliveries[0].movement.id;
    assert.ok(saleOrderView.includes(String(saleMovementId)));

    await navigate(`/purchase-requests/${purchaseRequest.id}`);
    await waitUntil('P11 purchase request view', () => `document.body.innerText.includes(${JSON.stringify(purchaseRequest.code)})`);
    const purchaseRequestView = await cdp.evaluate('document.body.innerText');
    assert.ok(purchaseRequestView.includes('تأییدشده'));
    assert.ok(purchaseRequestView.includes(purchaseOrder.code));

    await navigate(`/purchase-orders/${purchaseOrder.id}`);
    await waitUntil('P11 purchase order view', () => `document.body.innerText.includes(${JSON.stringify(purchaseOrder.code)})`);
    const purchaseOrderView = await cdp.evaluate('document.body.innerText');
    const purchaseReceipt = purchaseOrderDetail.lines[0].receipts[0];
    assert.ok(purchaseOrderView.includes(String(purchaseReceipt.movement.id)));

    await navigate('/settlements');
    await waitUntil('P11 settlement workspace', () => `Boolean(document.querySelector('.settlement-layout'))`);
    const customerCardSelector = `[data-testid="settlement-invoice-customer-${customerInvoice.id}"]`;
    await waitUntil('P11 customer settlement card', () => `Boolean(document.querySelector(${JSON.stringify(customerCardSelector)}))`);
    const customerCardText = await cdp.evaluate(`document.querySelector(${JSON.stringify(customerCardSelector)})?.innerText ?? ''`);
    assert.ok(customerCardText.includes(saleOrder.code));
    assert.ok(customerCardText.includes(String(saleMovementId)));
    await cdp.evaluate(`document.querySelector(${JSON.stringify(customerCardSelector)})?.scrollIntoView({ block: 'center' })`);
    await delay(150);
    await captureScreenshot('customer-journey-desktop', 1280, 900);
    await click('.settlement-tabs button:nth-child(2)');
    const supplierCardSelector = `[data-testid="settlement-invoice-supplier-${supplierInvoice.id}"]`;
    await waitUntil('P11 supplier settlement card', () => `Boolean(document.querySelector(${JSON.stringify(supplierCardSelector)}))`);
    const supplierCardText = await cdp.evaluate(`document.querySelector(${JSON.stringify(supplierCardSelector)})?.innerText ?? ''`);
    assert.ok(supplierCardText.includes(purchaseOrder.code));
    assert.ok(supplierCardText.includes(String(purchaseReceipt.movement.id)));
    await cdp.evaluate(`document.querySelector(${JSON.stringify(supplierCardSelector)})?.scrollIntoView({ block: 'center' })`);
    await delay(150);
    await captureScreenshot('supplier-journey-desktop', 1280, 900);
    const journeyUi = {
        saleOrder: { id: saleOrder.id, code: saleOrder.code, deliveryId: saleOrderDetail.lines[0].fulfillment.deliveries[0].id, movementId: saleMovementId },
        purchaseRequest: { id: purchaseRequest.id, code: purchaseRequest.code, approvedBy: purchaseRequest.approved_by },
        purchaseOrder: { id: purchaseOrder.id, code: purchaseOrder.code, receiptId: purchaseReceipt.id, movementId: purchaseReceipt.movement.id },
        customerInvoice: { id: customerInvoice.id, amountRial: customerInvoice.amount_rial, allocatedRial: customerInvoice.allocated_rial, outstandingRial: customerInvoice.outstanding_rial },
        supplierInvoice: { id: supplierInvoice.id, amountRial: supplierInvoice.amount_rial, allocatedRial: supplierInvoice.allocated_rial, outstandingRial: supplierInvoice.outstanding_rial },
    };

    await openDashboard(book.id, reportDate);
    const anotherBook = options.books.find((item) => item.id !== book.id);
    let otherBookSales = null;
    if (anotherBook) {
        const otherResult = await browserFetch(`/api/v1/dashboard?book_id=${anotherBook.id}&as_of_date=${reportDate}&currency=IRR`);
        expectStatus(otherResult, 200, 'Read other same-organization book');
        otherBookSales = otherResult.body.data.metrics.net_sales.total_rial;
        assert.equal(otherBookSales, '0');
        await setSelect('#p11-book', anotherBook.id);
        await waitUntil('other book totals', () => `document.querySelector('[data-testid="p11-net-sales-value"]')?.textContent?.trim() === '۰'`);
        await setSelect('#p11-book', book.id);
        await waitUntil('selected book totals', () => `document.querySelector('[data-testid="p11-net-sales-value"]')?.textContent?.trim() === '۵٬۰۰۰٬۰۰۰'`);
    }

    await setSelect('#p11-currency', 'TOMAN');
    await waitUntil('exact toman conversion', () => `document.querySelector('[data-testid="p11-overdue-value"]')?.textContent?.trim() === '۶۰٬۰۰۰'`);
    const tomanValues = await cdp.evaluate(`({
        sales: document.querySelector('[data-testid="p11-net-sales-value"]')?.textContent?.trim(),
        overdue: document.querySelector('[data-testid="p11-overdue-value"]')?.textContent?.trim(),
    })`);
    assert.equal(tomanValues.sales, '۵۰۰٬۰۰۰');
    assert.equal(tomanValues.overdue, '۶۰٬۰۰۰');

    await setViewport(390, 844);
    await openDashboard(book.id, reportDate);
    const mobile = await checkMobileGeometry();
    assert.ok(mobile.documentWidth <= mobile.clientWidth, `P11 mobile page overflows horizontally: ${JSON.stringify(mobile)}`);
    assert.equal(mobile.dockVisible, true, `P11 mobile dock is not visible: ${JSON.stringify(mobile)}`);
    assert.ok((mobile.dockGap ?? -1) >= 0, `P11 content overlaps the mobile dock: ${JSON.stringify(mobile)}`);
    await cdp.evaluate('window.scrollTo(0, 0)');
    await delay(150);
    await captureScreenshot('dashboard-mobile', 390, 844);

    await cdp.evaluate('document.querySelector("#p11-book")?.focus()');
    await pressKey('Tab');
    const visibleFocus = await cdp.evaluate(`Boolean(document.activeElement?.matches(':focus-visible'))`);
    assert.equal(visibleFocus, true, 'Keyboard focus is not visible on the P11 dashboard.');

    await navigate(`/dashboard?book_id=${book.id}&as_of_date=${reportDate}&currency=IRR&glass=fallback&scene=bright`);
    await waitUntil('bright fallback dashboard', () => `Boolean(document.querySelector('[data-testid="p11-dashboard"]'))`);
    await setViewport(390, 844);
    const fallback = await cdp.evaluate(`(() => {
        const surfaces = [...document.querySelectorAll('.lg-surface')];
        const activeRefractionSurfaces = surfaces.filter((item) => item.classList.contains('lg-map-ready')
            && getComputedStyle(item).getPropertyValue('--lg-filter-url').trim() !== 'none').length;
        return { surfaces: surfaces.length, activeRefractionSurfaces, brightScene: document.documentElement.dataset.lgScene === 'bright' };
    })()`);
    assert.equal(fallback.brightScene, true);
    assert.ok(fallback.surfaces > 0, 'The dashboard did not render its shared glass controls.');
    assert.equal(fallback.activeRefractionSurfaces, 0, 'Forced fallback unexpectedly applied SVG refraction.');
    await cdp.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
    await delay(150);
    await captureScreenshot('dashboard-bright-fallback-mobile', 390, 844);
    assert.equal(browserErrors.length, 0, `Chrome reported runtime or network errors: ${browserErrors.join('; ')}`);

    summary = {
        organizationId: organization.id,
        organizationName: organization.name,
        bookId: book.id,
        bookCode: book.code,
        asOfDate: reportDate,
        timeZone: observed.book.time_zone,
        expected: { netSalesRial: '5000000', overdueReceivablesRial: '600000', availableStock: '131.500 EA', pendingApprovals: 1 },
        observed: {
            netSalesRial: observed.metrics.net_sales.total_rial,
            overdueReceivablesRial: observed.metrics.overdue_receivables.total_rial,
            availableStock: observed.metrics.available_stock.unit_totals.map((item) => `${item.quantity} ${item.unit.code}`).join(', '),
            pendingApprovals: observed.metrics.pending_purchase_approvals.count,
        },
        detailRows: {
            netSales: netDetails.rows,
            overdueReceivables: overdueDetails.rows,
            availableStock: stockDetails.rows,
            pendingApprovals: approvalsDetails.rows,
        },
        cutoffBoundaries: boundarySummaries,
        states: { loading: loadingText, error: errorState, empty: emptyState },
        journeys: journeyUi,
        otherBookNetSalesRial: otherBookSales,
        tomanValues,
        mobile,
        visibleFocus,
        forcedFallback: fallback,
        liveVite: { clientLoaded: viteClientLoaded, dashboardStyleLoaded },
        screenshots,
        runtimeErrors: browserErrors.length,
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} finally {
    cdp?.close();
    if (keepOpen) {
        browserProcess?.unref();
        process.stdout.write(`Chrome remains open for review; temporary profile: ${resolvedProfile}\n`);
    } else {
        if (browserProcess && browserProcess.exitCode === null) browserProcess.kill();
        if (resolvedProfile.startsWith(`${profileRoot}${path.sep}`)) {
            try { await rm(resolvedProfile, { recursive: true, force: true }); } catch { /* Preserve an in-use diagnostic profile. */ }
        }
    }
}
