import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.P09_BROWSER_BASE_URL ?? 'http://127.0.0.1:8000';
const browserPath = process.env.P09_BROWSER_EXECUTABLE ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const phpPath = process.env.ERP_PHP_BINARY ?? 'C:\\php8.5\\php.exe';
const credentialsPath = path.join(projectRoot, 'storage', 'app', 'private', 'p03-demo-credentials.json');
const screenshotDirectory = path.join(projectRoot, 'docs', 'screenshots');
const profileRoot = path.resolve(projectRoot, 'storage', 'framework', 'testing');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const suffix = Date.now().toString(36).toUpperCase();
const bookCode = process.env.P09_BROWSER_BOOK_CODE ?? `P09-BR-${suffix}`;
const editorCredentials = JSON.parse(await readFile(credentialsPath, 'utf8')).editor;
assert.ok(editorCredentials?.email && editorCredentials?.password, 'Local P03 editor credentials are unavailable.');
await access(browserPath);
await access(phpPath);
await mkdir(profileRoot, { recursive: true });
await mkdir(screenshotDirectory, { recursive: true });

const profileDirectory = await mkdtemp(path.join(profileRoot, 'p09-browser-'));
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
                if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
                    const detail = (message.params.args ?? []).map((item) => item.value ?? item.description ?? '').join(' ');
                    browserErrors.push(`Chrome console error: ${detail}`);
                }
                if (message.method === 'Log.entryAdded'
                    && message.params.entry.source === 'javascript'
                    && message.params.entry.level === 'error') {
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
    return captureCurrentScreenshot(name, width, height);
}

async function captureCurrentScreenshot(name, width, height) {
    const image = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    const filename = `p09-${name}-${timestamp}.png`;
    await writeFile(path.join(screenshotDirectory, filename), Buffer.from(image.data, 'base64'));
    screenshots.push({ filename, width, height });
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
    const defaultOrganization = workspace.body.organizations.find((item) => item.name === 'سازمان پیش‌فرض' && item.role === 'editor');
    assert.ok(defaultOrganization, 'The P03 editor membership for the default organization is unavailable.');
    if (workspace.body.active_organization.id !== defaultOrganization.id) {
        expectStatus(await browserFetch('/api/v1/active-organization', 'POST', { organization_id: defaultOrganization.id }), 200, 'Switch active organization');
    }
}

async function openDisclosure(index) {
    const opened = await cdp.evaluate(`(() => {
        const item = document.querySelectorAll('.accounting-disclosure')[${index}];
        if (!item) return false;
        item.open = true;
        return true;
    })()`);
    const state = await cdp.evaluate(`({ path: location.pathname, details: document.querySelectorAll('.accounting-disclosure').length, body: document.body?.innerText?.slice(-900) ?? '' })`);
    assert.equal(opened, true, `Accounting setup disclosure ${index} was not found: ${JSON.stringify(state)}`);
}

async function createAccount(bookId, account) {
    await waitUntil('accounting setup rail ready', () => `Boolean(document.querySelector('.accounting-page-grid')) && document.querySelectorAll('.accounting-disclosure').length >= 2`);
    const before = await browserFetch(`/api/v1/accounting/options?book_id=${bookId}`);
    expectStatus(before, 200, `Read existing ${account.code} account`);
    const existing = before.body.data.accounts.find((item) => item.code === account.code);
    if (existing) return existing;

    await openDisclosure(0);
    await setInput('#accounting-account-code', account.code);
    await setInput('#accounting-account-name', account.name);
    await setSelect('#accounting-account-category', account.category);
    await setSelect('#accounting-account-parent', '');
    await submitForm('[data-testid="accounting-account-form"]');
    const deadline = Date.now() + 20000;
    let options;
    let saved;
    while (Date.now() < deadline) {
        options = await browserFetch(`/api/v1/accounting/options?book_id=${bookId}`);
        expectStatus(options, 200, `Read accounts after ${account.code}`);
        saved = options.body.data.accounts.find((item) => item.code === account.code);
        if (saved) break;
        await delay(150);
    }
    assert.ok(saved, `Account ${account.code} was not saved through the UI.`);
    return saved;
}

async function createPeriod(bookId, period) {
    await waitUntil('accounting setup rail ready', () => `Boolean(document.querySelector('.accounting-page-grid')) && document.querySelectorAll('.accounting-disclosure').length >= 2`);
    const before = await browserFetch(`/api/v1/accounting/options?book_id=${bookId}`);
    expectStatus(before, 200, `Read existing ${period.code} period`);
    const existing = before.body.data.periods.find((item) => item.code === period.code);
    if (existing) return existing;

    await openDisclosure(1);
    await setInput('#accounting-period-code', period.code);
    await setInput('#accounting-period-name', period.name);
    await setInput('#accounting-period-start', period.starts_on);
    await setInput('#accounting-period-end', period.ends_on);
    await submitForm('[data-testid="accounting-period-form"]');
    const deadline = Date.now() + 20000;
    let options;
    let saved;
    while (Date.now() < deadline) {
        options = await browserFetch(`/api/v1/accounting/options?book_id=${bookId}`);
        expectStatus(options, 200, `Read periods after ${period.code}`);
        saved = options.body.data.periods.find((item) => item.code === period.code);
        if (saved) break;
        await delay(150);
    }
    assert.ok(saved, `Period ${period.code} was not saved through the UI.`);
    return saved;
}

async function createAndPostJournal(bookId, input) {
    const list = await browserFetch(`/api/v1/accounting/journals?book_id=${bookId}`);
    expectStatus(list, 200, `Find existing ${input.description} journal`);
    const existing = list.body.data.find((item) => item.description === input.description);
    if (existing) {
        await navigate(`/accounting/journals/${existing.id}?book_id=${bookId}`);
        if (existing.status === 'posted') {
            await waitUntil(`existing posted ${input.description}`, () => `Boolean(document.querySelector('[data-testid^="accounting-journal-detail-"]'))`);
            const detail = await browserFetch(`/api/v1/accounting/journals/${existing.id}`);
            expectStatus(detail, 200, `Read existing ${input.description}`);
            return detail.body.data;
        }
        await waitUntil(`existing draft ${input.description}`, () => `Boolean(document.querySelector('[data-testid="accounting-journal-editor"]'))`);
    } else {
        await navigate(`/accounting/journals/new?book_id=${bookId}`);
    }
    await waitUntil('new P09 draft form', () => `Boolean(document.querySelector('[data-testid="accounting-journal-form"]'))`);
    await setInput('#accounting-journal-date', input.accounting_date);
    await setInput('#accounting-journal-description', input.description);
    for (let index = 0; index < input.lines.length; index += 1) {
        const line = input.lines[index];
        await setSelect(`#accounting-line-account-${index}`, line.account_id);
        await setInput(`#accounting-line-memo-${index}`, line.memo ?? '');
        await setInput(`#accounting-line-debit-${index}`, line.debit_rial);
        await setInput(`#accounting-line-credit-${index}`, line.credit_rial);
    }
    await clickButtonContaining('ثبت نهایی');
    await waitUntil('posted journal detail', () => `Boolean(document.querySelector('[data-testid^="accounting-journal-detail-"]'))`, 25000);
    const journalId = Number(await cdp.evaluate(`location.pathname.split('/').at(-1)`));
    const detail = await browserFetch(`/api/v1/accounting/journals/${journalId}`);
    expectStatus(detail, 200, `Read posted journal ${input.description}`);
    assert.equal(detail.body.data.status, 'posted');
    assert.equal(detail.body.data.debit_total_rial, detail.body.data.credit_total_rial);
    return detail.body.data;
}

async function createDraftThroughUi(bookId, input) {
    const list = await browserFetch(`/api/v1/accounting/journals?book_id=${bookId}`);
    expectStatus(list, 200, `Find existing ${input.description} draft`);
    const existing = list.body.data.find((item) => item.description === input.description);
    if (existing) {
        await navigate(`/accounting/journals/${existing.id}?book_id=${bookId}`);
        if (existing.status === 'posted') return existing;
        await waitUntil(`existing draft ${input.description}`, () => `Boolean(document.querySelector('[data-testid="accounting-journal-editor"]'))`);
        return existing;
    }
    await navigate(`/accounting/journals/new?book_id=${bookId}`);
    await waitUntil('new P09 draft form', () => `Boolean(document.querySelector('[data-testid="accounting-journal-form"]'))`);
    await setInput('#accounting-journal-date', input.accounting_date);
    await setInput('#accounting-journal-description', input.description);
    for (let index = 0; index < input.lines.length; index += 1) {
        const line = input.lines[index];
        await setSelect(`#accounting-line-account-${index}`, line.account_id);
        await setInput(`#accounting-line-memo-${index}`, line.memo ?? '');
        await setInput(`#accounting-line-debit-${index}`, line.debit_rial);
        await setInput(`#accounting-line-credit-${index}`, line.credit_rial);
    }
    await clickButtonContaining('ذخیرهٔ پیش‌نویس');
    await waitUntil('saved P09 draft detail', () => `location.pathname.startsWith('/accounting/journals/') && /^\\d+$/.test(location.pathname.split('/').at(-1)) && Boolean(document.querySelector('[data-testid="accounting-journal-editor"]'))`, 25000);
    const journalId = Number(await cdp.evaluate(`location.pathname.split('/').at(-1)`));
    const detail = await browserFetch(`/api/v1/accounting/journals/${journalId}`);
    expectStatus(detail, 200, 'Read saved P09 draft');
    assert.equal(detail.body.data.status, 'draft');
    return detail.body.data;
}

async function setViewport(width, height) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await delay(300);
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
        cwd: projectRoot, stdio: 'ignore', windowsHide: true,
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
        const timer = setTimeout(() => reject(new Error(`Accounting book lock worker timed out: ${errors}`)), 15000);
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

async function sessionCookieHeader() {
    const { cookies = [] } = await cdp.send('Network.getAllCookies');
    const local = cookies.filter((cookie) => cookie.domain.includes('127.0.0.1'));
    assert.ok(local.some((cookie) => cookie.name.toLowerCase().includes('session')), 'Chrome did not retain a local session cookie.');
    return local.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

async function requestWithSession(url, cookie, csrf, pathname, key) {
    const response = await fetch(`${url}${pathname}`, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Cookie: cookie,
            'X-CSRF-TOKEN': csrf,
            'Idempotency-Key': key,
        },
        body: '{}',
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function stopProcess(child) {
    if (!child || child.exitCode !== null) return;
    child.kill();
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(5000)]);
}

async function stopChromeTree(child) {
    if (!child) return;
    if (process.platform === 'win32' && child.pid && child.exitCode === null) {
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        await new Promise((resolve) => killer.once('exit', resolve));
    }
    await stopProcess(child);
}

let summary;
process.stdout.write(`P09 browser fixture book: ${bookCode}\n`);
try {
    await startBrowser();
    await login();
    await navigate('/accounting/journals');
    await waitUntil('accounting workspace', () => `Boolean(document.querySelector('[data-testid="accounting-book-form"]')) || Boolean(document.querySelector('[data-testid="accounting-book-selector"]'))`);
    assert.equal(await cdp.evaluate(`document.querySelector('[data-testid="accounting-scope-note"]')?.innerText.includes('خودکار') ?? false`), true);

    const optionsBeforeBook = await browserFetch('/api/v1/accounting/options');
    expectStatus(optionsBeforeBook, 200, 'Read accounting books');
    assert.equal(optionsBeforeBook.body.can_manage, true, `The active organization does not grant accounting setup: ${JSON.stringify(optionsBeforeBook.body)}`);
    let book = optionsBeforeBook.body.data.books.find((item) => item.code === bookCode);
    if (!book) {
        assert.ok(await cdp.evaluate(`Boolean(document.querySelector('[data-testid="accounting-book-form"]'))`), 'The new-book form is unavailable.');
        await setInput('#accounting-book-code', bookCode);
        await setInput('#accounting-book-name', `دفتر پذیرش حسابداری ${suffix}`);
        await submitForm('[data-testid="accounting-book-form"]');
        const deadline = Date.now() + 20000;
        while (Date.now() < deadline && !book) {
            const updated = await browserFetch('/api/v1/accounting/options');
            expectStatus(updated, 200, 'Read accounting book after UI create');
            book = updated.body.data.books.find((item) => item.code === bookCode);
            if (!book) await delay(150);
        }
    } else {
        await navigate(`/accounting/journals?book_id=${book.id}`);
        await waitUntil('existing accounting book selected', () => `Boolean(document.querySelector('[data-testid="accounting-book-selector"]')) && Boolean(document.querySelector('.accounting-page-grid'))`);
    }
    assert.ok(book, 'The book was not created through the UI.');

    const accounts = {};
    const accountFixtures = [
        { key: 'receivable', code: '1100', name: 'دریافتنی fixture', category: 'asset' },
        { key: 'revenue', code: '4100', name: 'درآمد فروش fixture', category: 'revenue' },
        { key: 'inventory', code: '1300', name: 'خرید/موجودی fixture', category: 'asset' },
        { key: 'payable', code: '2100', name: 'پرداختنی fixture', category: 'liability' },
        { key: 'cash', code: '1010', name: 'وجه نقد/بانک fixture', category: 'asset' },
    ];
    for (const fixture of accountFixtures) {
        accounts[fixture.key] = await createAccount(book.id, fixture);
    }

    const period2026 = await createPeriod(book.id, {
        code: 'P09-2026', name: 'دورهٔ آزمایشی ۲۰۲۶', starts_on: '2026-01-01', ends_on: '2026-12-31',
    });
    const period2027 = await createPeriod(book.id, {
        code: 'P09-2027', name: 'دورهٔ آزمایشی ۲۰۲۷', starts_on: '2027-01-01', ends_on: '2027-12-31',
    });
    assert.ok(['open', 'closed'].includes(period2026.status), 'The 2026 fixture period has an unexpected state.');
    assert.equal(period2027.status, 'open', 'The 2027 reversal and contention period must remain open.');

    await setViewport(1280, 900);
    const journals = {};
    journals.sale = await createAndPostJournal(book.id, {
        accounting_date: '2026-11-22', description: 'Synthetic sale on account', lines: [
            { account_id: accounts.receivable.id, memo: 'Accounts receivable fixture', debit_rial: '1000000', credit_rial: '0' },
            { account_id: accounts.revenue.id, memo: 'Sales revenue fixture', debit_rial: '0', credit_rial: '1000000' },
        ],
    });
    await captureScreenshot('sale-posted-desktop', 1280, 900);
    journals.purchase = await createAndPostJournal(book.id, {
        accounting_date: '2026-11-22', description: 'Synthetic purchase on account', lines: [
            { account_id: accounts.inventory.id, memo: 'Illustrative purchase or inventory fixture', debit_rial: '500000', credit_rial: '0' },
            { account_id: accounts.payable.id, memo: 'Accounts payable fixture', debit_rial: '0', credit_rial: '500000' },
        ],
    });
    journals.collection = await createAndPostJournal(book.id, {
        accounting_date: '2026-11-22', description: 'Synthetic customer collection', lines: [
            { account_id: accounts.cash.id, memo: 'Cash or bank fixture', debit_rial: '400000', credit_rial: '0' },
            { account_id: accounts.receivable.id, memo: 'Accounts receivable fixture', debit_rial: '0', credit_rial: '400000' },
        ],
    });
    journals.payment = await createAndPostJournal(book.id, {
        accounting_date: '2026-11-22', description: 'Synthetic supplier payment', lines: [
            { account_id: accounts.payable.id, memo: 'Accounts payable fixture', debit_rial: '200000', credit_rial: '0' },
            { account_id: accounts.cash.id, memo: 'Cash or bank fixture', debit_rial: '0', credit_rial: '200000' },
        ],
    });

    await navigate(`/accounting/journals?book_id=${book.id}`);
    await waitUntil('P09 journal register', () => `document.querySelectorAll('.accounting-journal-row').length >= 4`);
    await captureScreenshot('journal-register-desktop', 1280, 900);

    if (period2026.status === 'open') {
        await openDisclosure(1);
        const closeButton = await cdp.evaluate(`(() => {
            const row = document.querySelector('[data-testid="accounting-period-${period2026.id}"]');
            const button = row && [...row.querySelectorAll('button')].find((item) => item.innerText.includes('بستن دوره'));
            if (!button) return false;
            button.click();
            return true;
        })()`);
        assert.equal(closeButton, true, 'The 2026 close-period action was unavailable in the UI.');
        const deadline = Date.now() + 20000;
        let closed = false;
        while (Date.now() < deadline && !closed) {
            const updated = await browserFetch(`/api/v1/accounting/options?book_id=${book.id}`);
            expectStatus(updated, 200, 'Read 2026 period close result');
            closed = updated.body.data.periods.find((item) => item.id === period2026.id)?.status === 'closed';
            if (!closed) await delay(150);
        }
        assert.equal(closed, true, 'The 2026 period did not close from the UI action.');
    }
    await navigate(`/accounting/journals?book_id=${book.id}`);
    await waitUntil('register after closing period', () => `Boolean(document.querySelector('.accounting-page-grid'))`);
    const postedReplay = await browserFetch(`/api/v1/accounting/journals/${journals.sale.id}/post`, 'POST', {}, { 'Idempotency-Key': journals.sale.posting_identity });
    expectStatus(postedReplay, 200, 'Replay posted sale after closing its period');
    assert.equal(postedReplay.body.already_exists, true);
    assert.equal(postedReplay.body.data.id, journals.sale.id);

    const saleAfterReplay = await browserFetch(`/api/v1/accounting/journals/${journals.sale.id}`);
    expectStatus(saleAfterReplay, 200, 'Check for an existing synthetic sale reversal');
    let reversal;
    if (saleAfterReplay.body.data.reversal) {
        const existingReversal = await browserFetch(`/api/v1/accounting/journals/${saleAfterReplay.body.data.reversal.id}`);
        expectStatus(existingReversal, 200, 'Read existing synthetic sale reversal');
        reversal = existingReversal.body.data;
        await navigate(`/accounting/journals/${reversal.id}?book_id=${book.id}`);
        await waitUntil('existing reversal detail', () => `Boolean(document.querySelector('[data-testid^="accounting-journal-detail-"]'))`);
    } else {
        await navigate(`/accounting/journals/${journals.sale.id}?book_id=${book.id}`);
        await waitUntil('reversal form for closed original period', () => `Boolean(document.querySelector('[data-testid="accounting-reversal-form"]'))`);
        await setInput('#accounting-reversal-date', '2027-01-01');
        await setInput('#accounting-reversal-reason', 'Synthetic reversal example');
        await submitForm('[data-testid="accounting-reversal-form"]');
        await waitUntil('reversal detail', () => `Boolean(document.querySelector('[data-testid^="accounting-journal-detail-"]')) && Boolean(document.querySelector('.accounting-note a[href*="/accounting/journals/"]'))`, 25000);
        const reversalId = Number(await cdp.evaluate(`location.pathname.split('/').at(-1)`));
        const reversalResponse = await browserFetch(`/api/v1/accounting/journals/${reversalId}`);
        expectStatus(reversalResponse, 200, 'Read posted reversal');
        reversal = reversalResponse.body.data;
    }
    assert.equal(reversal.status, 'posted');
    assert.equal(reversal.reversal_of.id, journals.sale.id);
    assert.equal(reversal.accounting_date, '2027-01-01');
    assert.equal(reversal.debit_total_rial, '1000000');
    assert.equal(reversal.credit_total_rial, '1000000');
    const originalAfterReverse = await browserFetch(`/api/v1/accounting/journals/${journals.sale.id}`);
    expectStatus(originalAfterReverse, 200, 'Read original reversal link');
    assert.equal(originalAfterReverse.body.data.reversal.id, reversal.id);
    await captureScreenshot('reversal-detail-desktop', 1280, 900);

    const raceDraft = await createDraftThroughUi(book.id, {
        accounting_date: '2027-01-02', description: `Synthetic contention post ${timestamp}`, lines: [
            { account_id: accounts.receivable.id, memo: 'Contention debit', debit_rial: '1', credit_rial: '0' },
            { account_id: accounts.revenue.id, memo: 'Contention credit', debit_rial: '0', credit_rial: '1' },
        ],
    });
    const raceWasAlreadyPosted = raceDraft.status === 'posted';
    const raceKey = raceWasAlreadyPosted ? raceDraft.posting_identity : uuid();
    const lockWorker = spawn(phpPath, [
        path.join(projectRoot, 'scripts', 'Lock-P09BookForConcurrency.php'),
        String((await browserFetch('/api/v1/workspace')).body.active_organization.id), String(book.id),
    ], { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    lockProcess = lockWorker;
    await waitForLockWorker();
    const cookie = await sessionCookieHeader();
    const csrf = await cdp.evaluate(`document.querySelector('meta[name="csrf-token"]')?.content ?? ''`);
    const secondaryUrl = await startSecondServer();
    const racePath = `/api/v1/accounting/journals/${raceDraft.id}/post`;
    let settled = 0;
    const requests = [baseUrl, secondaryUrl].map((url) => requestWithSession(url, cookie, csrf, racePath, raceKey)
        .finally(() => { settled += 1; }));
    await delay(350);
    assert.equal(settled, 0, 'Posting requests did not wait for the shared accounting-book lock.');
    const raceResponses = await Promise.all(requests);
    const lockExit = await new Promise((resolve, reject) => {
        if (lockProcess.exitCode !== null) return resolve(lockProcess.exitCode);
        lockProcess.once('exit', resolve);
        lockProcess.once('error', reject);
    });
    assert.equal(lockExit, 0, `Accounting book lock worker exited ${lockExit}.`);
    lockProcess = null;
    const expectedRaceStatuses = raceWasAlreadyPosted ? [200, 200] : [200, 201];
    assert.deepEqual(raceResponses.map((item) => item.status).sort(), expectedRaceStatuses, 'Concurrent same-key posting retries should resolve to one persisted journal.');
    assert.equal(raceResponses[0].body.data.id, raceDraft.id);
    assert.equal(raceResponses[1].body.data.id, raceDraft.id);
    const raceReadback = await browserFetch(`/api/v1/accounting/journals/${raceDraft.id}`);
    expectStatus(raceReadback, 200, 'Read posting contention result');
    assert.equal(raceReadback.body.data.status, 'posted');
    assert.equal(raceReadback.body.data.lines.length, 2);

    await navigate(`/accounting/journals?book_id=${book.id}`);
    await waitUntil('register before period closure race', () => `Boolean(document.querySelector('.accounting-page-grid'))`);
    let closurePeriod = null;
    let closureYear = 2028;
    for (; closureYear < 2040 && closurePeriod === null; closureYear += 1) {
        const code = `P09-CLOSE-${closureYear}`;
        const currentOptions = await browserFetch(`/api/v1/accounting/options?book_id=${book.id}`);
        expectStatus(currentOptions, 200, `Find open closure-race period ${closureYear}`);
        const existingPeriod = currentOptions.body.data.periods.find((item) => item.code === code);
        if (existingPeriod?.status === 'closed') continue;
        closurePeriod = existingPeriod ?? await createPeriod(book.id, {
            code,
            name: `دورهٔ هم‌زمانی ${closureYear}`,
            starts_on: `${closureYear}-01-01`,
            ends_on: `${closureYear}-12-31`,
        });
    }
    assert.ok(closurePeriod?.status === 'open', 'No open synthetic period was available for the close/post race.');
    closureYear -= 1;
    const closureDraft = await createDraftThroughUi(book.id, {
        accounting_date: `${closureYear}-01-01`,
        description: `Synthetic period closure race ${timestamp}`,
        lines: [
            { account_id: accounts.receivable.id, memo: 'Closure race debit', debit_rial: '1', credit_rial: '0' },
            { account_id: accounts.revenue.id, memo: 'Closure race credit', debit_rial: '0', credit_rial: '1' },
        ],
    });
    const closureWorker = spawn(phpPath, [
        path.join(projectRoot, 'scripts', 'Lock-P09BookForConcurrency.php'),
        String((await browserFetch('/api/v1/workspace')).body.active_organization.id), String(book.id),
    ], { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    lockProcess = closureWorker;
    await waitForLockWorker();
    const closePath = `/api/v1/accounting/periods/${closurePeriod.id}/close`;
    const closeRequest = requestWithSession(baseUrl, cookie, csrf, closePath, uuid());
    await delay(120);
    const closurePostPath = `/api/v1/accounting/journals/${closureDraft.id}/post`;
    let closureSettled = 0;
    const concurrentClose = closeRequest.finally(() => { closureSettled += 1; });
    const concurrentPost = requestWithSession(secondaryUrl, cookie, csrf, closurePostPath, uuid()).finally(() => { closureSettled += 1; });
    await delay(300);
    assert.equal(closureSettled, 0, 'Period closure and posting did not wait on the shared book lock.');
    const [closeRaceResult, postRaceResult] = await Promise.all([concurrentClose, concurrentPost]);
    const closureLockExit = await new Promise((resolve, reject) => {
        if (lockProcess.exitCode !== null) return resolve(lockProcess.exitCode);
        lockProcess.once('exit', resolve);
        lockProcess.once('error', reject);
    });
    assert.equal(closureLockExit, 0, `Period closure lock worker exited ${closureLockExit}.`);
    lockProcess = null;
    expectStatus(closeRaceResult, 200, 'Close a period during competing post');
    assert.ok([201, 422].includes(postRaceResult.status), `Unexpected concurrent post result: ${JSON.stringify(postRaceResult)}`);
    const closureReadback = await browserFetch(`/api/v1/accounting/options?book_id=${book.id}`);
    expectStatus(closureReadback, 200, 'Read period closure race result');
    assert.equal(closureReadback.body.data.periods.find((item) => item.id === closurePeriod.id)?.status, 'closed');
    const closureJournalReadback = await browserFetch(`/api/v1/accounting/journals/${closureDraft.id}`);
    expectStatus(closureJournalReadback, 200, 'Read period closure race journal');
    assert.equal(closureJournalReadback.body.data.status, postRaceResult.status === 201 ? 'posted' : 'draft');

    await navigate(`/accounting/journals?book_id=${book.id}`);
    await waitUntil('register before UI closure check', () => `Boolean(document.querySelector('.accounting-page-grid'))`);
    let uiCloseResult = 'already-closed';
    if (period2027.status === 'open') {
        await openDisclosure(1);
        const closeButton = await cdp.evaluate(`(() => {
            const row = document.querySelector('[data-testid="accounting-period-${period2027.id}"]');
            const button = row && [...row.querySelectorAll('button')].find((item) => item.innerText.includes('بستن دوره'));
            if (!button) return false;
            button.click();
            return true;
        })()`);
        assert.equal(closeButton, true, 'The 2027 close action was unavailable in the UI.');
        await waitUntil('2027 closed in the current UI', () => `document.querySelector('[data-testid="accounting-period-${period2027.id}"]')?.innerText.includes('بسته')`);
        uiCloseResult = 'closed-in-ui';
    }

    await navigate(`/accounting/journals?book_id=${book.id}`);
    await waitUntil('mobile journal register', () => `document.querySelectorAll('.accounting-journal-row').length >= 6`);
    await setViewport(390, 844);
    await cdp.evaluate(`document.querySelector('#accounting-book-selector')?.focus()`);
    await pressKey('Tab');
    const focusMetrics = await cdp.evaluate(`(() => {
        const focused = document.activeElement;
        const style = focused ? getComputedStyle(focused) : null;
        const focusSurface = focused?.closest('.search-field') ?? focused;
        const surfaceStyle = focusSurface ? getComputedStyle(focusSurface) : null;
        const focusWithin = Boolean(focusSurface && focusSurface !== focused && focusSurface.matches(':focus-within'));
        const outline = style?.outlineStyle ?? 'none';
        const visibleSurfaceCue = focusWithin && (surfaceStyle?.boxShadow !== 'none' || surfaceStyle?.borderColor !== 'rgba(0, 0, 0, 0)');
        return {
            visibleFocus: Boolean(focused && ((outline !== 'none' && outline !== '0px') || visibleSurfaceCue)),
            focusElement: focused ? { tag: focused.tagName, id: focused.id, role: focused.getAttribute('role'), outline, outlineWidth: style?.outlineWidth, surfaceCue: { boxShadow: surfaceStyle?.boxShadow, borderColor: surfaceStyle?.borderColor } } : null,
        };
    })()`);
    assert.ok(focusMetrics.visibleFocus, `Keyboard focus was not visibly outlined: ${JSON.stringify(focusMetrics.focusElement)}`);
    await cdp.evaluate(`window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })`);
    await delay(250);
    const mobileMetrics = await cdp.evaluate(`(() => {
        const dockElement = document.querySelector('.mobile-focus-dock');
        const dock = dockElement?.getBoundingClientRect();
        const lastPanel = document.querySelector('.accounting-setup-rail > .accounting-panel')?.getBoundingClientRect()
            ?? document.querySelector('.accounting-register-panel')?.getBoundingClientRect();
        return {
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
            documentWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            scrollY: Math.round(scrollY * 100) / 100,
            lastPanelBottom: lastPanel ? Math.round(lastPanel.bottom * 100) / 100 : null,
            dockTop: dock ? Math.round(dock.top * 100) / 100 : null,
            dockGap: lastPanel && dock ? Math.round((dock.top - lastPanel.bottom) * 100) / 100 : null,
            dockVisible: Boolean(dock && dock.top >= 0 && dock.bottom <= innerHeight),
            dockPosition: dock ? getComputedStyle(dockElement).position : null,
            dockDisplay: dock ? getComputedStyle(dockElement).display : null,
            dockClass: dockElement?.className?.baseVal ?? dockElement?.className ?? null,
            mediaNarrow: matchMedia('(max-width: 760px)').matches,
        };
    })()`);
    assert.equal(mobileMetrics.documentWidth, mobileMetrics.clientWidth, 'P09 mobile workspace has horizontal overflow.');
    assert.ok(mobileMetrics.dockVisible, `The mobile command dock is outside the viewport: ${JSON.stringify(mobileMetrics)}`);
    assert.ok((mobileMetrics.dockGap ?? -1) >= 0, `The last setup panel overlaps the mobile dock: ${JSON.stringify(mobileMetrics)}`);
    await captureCurrentScreenshot('journal-register-mobile', 390, 844);

    await navigate(`/accounting/journals?book_id=${book.id}&glass=fallback&scene=bright`);
    await waitUntil('bright fallback register', () => `Boolean(document.querySelector('[data-testid="accounting-book-selector"]'))`);
    await setViewport(390, 844);
    const fallback = await cdp.evaluate(`(() => {
        const surfaces = [...document.querySelectorAll('.lg-surface')];
        const activeRefractionSurfaces = surfaces.filter((item) => item.classList.contains('lg-map-ready')
            && getComputedStyle(item).getPropertyValue('--lg-filter-url').trim() !== 'none').length;
        return {
            surfaces: surfaces.length,
            svgFilterDefinitions: document.querySelectorAll('.lg-filter-root feDisplacementMap').length,
            activeRefractionSurfaces,
            brightScene: document.documentElement.dataset.lgScene === 'bright',
        };
    })()`);
    assert.equal(fallback.brightScene, true);
    assert.ok(fallback.surfaces > 0, 'The fallback did not render shared glass surfaces.');
    assert.equal(fallback.activeRefractionSurfaces, 0, 'The forced fallback unexpectedly applied SVG refraction.');
    await captureScreenshot('fallback-mobile', 390, 844);

    const liveAssets = await cdp.evaluate(`performance.getEntriesByType('resource').map((item) => item.name)`);
    const viteClientLoaded = liveAssets.some((item) => item.includes(':5173/@vite/client'));
    const accountingStyleLoaded = liveAssets.some((item) => item.includes('accounting.css'));
    assert.equal(viteClientLoaded, true, 'The live route did not load the Vite client.');
    assert.equal(accountingStyleLoaded, true, 'Vite did not resolve accounting.css on the live route.');
    assert.equal(browserErrors.length, 0, `Chrome reported runtime or network errors: ${browserErrors.join('; ')}`);

    const all = await browserFetch(`/api/v1/accounting/journals?book_id=${book.id}`);
    expectStatus(all, 200, 'Read final journal register');
    const accountNet = new Map();
    for (const line of [...journals.sale.lines, ...reversal.lines]) {
        const net = BigInt(line.debit_rial) - BigInt(line.credit_rial);
        accountNet.set(line.account.id, (accountNet.get(line.account.id) ?? 0n) + net);
    }
    assert.equal(accountNet.get(accounts.receivable.id), 0n);
    assert.equal(accountNet.get(accounts.revenue.id), 0n);

    summary = {
        organizationId: (await browserFetch('/api/v1/workspace')).body.active_organization.id,
        bookId: book.id,
        bookCode,
        journals: Object.fromEntries(Object.entries(journals).map(([key, value]) => [key, { id: value.id, debitRial: value.debit_total_rial, creditRial: value.credit_total_rial }])),
        reversal: { id: reversal.id, originalId: reversal.reversal_of.id, date: reversal.accounting_date },
        retryAfterPeriodClose: { status: postedReplay.status, sameJournalId: postedReplay.body.data.id === journals.sale.id },
        contention: { statuses: raceResponses.map((item) => item.status), persistedJournalId: raceReadback.body.data.id, lines: raceReadback.body.data.lines.length },
        periodClosureRace: { closeStatus: closeRaceResult.status, postStatus: postRaceResult.status, finalPeriodStatus: closureReadback.body.data.periods.find((item) => item.id === closurePeriod.id)?.status, journalStatus: closureJournalReadback.body.data.status },
        uiPeriodClose: { periodId: period2027.id, outcome: uiCloseResult },
        keyboardAndMobile: { ...mobileMetrics, visibleFocus: focusMetrics.visibleFocus, focusElement: focusMetrics.focusElement },
        forcedFallback: fallback,
        liveVite: { clientLoaded: viteClientLoaded, accountingStyleLoaded },
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
