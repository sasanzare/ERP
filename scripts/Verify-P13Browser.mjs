import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.P13_BROWSER_BASE_URL ?? 'http://127.0.0.1:8000';
const browserPath = process.env.P13_BROWSER_EXECUTABLE ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const phpPath = process.env.ERP_PHP_BINARY ?? 'C:\\php8.5\\php.exe';
const credentialsPath = path.join(projectRoot, 'storage', 'app', 'private', 'p03-demo-credentials.json');
const screenshotDirectory = path.join(projectRoot, 'docs', 'screenshots');
const profileRoot = path.resolve(os.tmpdir(), 'erp-p13-browser');
const stamp = process.env.P13_SCREENSHOT_STAMP ?? new Date().toISOString().replace(/[:.]/g, '-');
const nonce = process.env.P13_FIXTURE_NONCE ?? stamp.replace(/[^0-9A-Za-z]/g, '').slice(-10);
const memberEmail = (process.env.P13_BROWSER_MEMBER_EMAIL ?? `p13-browser-${nonce}@example.test`).toLowerCase();
const existingCode = `P13-EXIST-${nonce}`;
const browserErrors = [];
const screenshots = [];
const headless = process.env.P13_BROWSER_HEADLESS !== '0';
const captureImages = process.env.P13_CAPTURE_SCREENSHOTS !== '0';
const keepOpen = process.env.P13_BROWSER_KEEP_OPEN === '1';
const credentials = JSON.parse(await readFile(credentialsPath, 'utf8')).editor;
assert.ok(credentials?.email && credentials?.password, 'Local P03 editor credentials are unavailable.');
await access(browserPath);
await mkdir(profileRoot, { recursive: true });
await mkdir(screenshotDirectory, { recursive: true });

let browserProcess;
let cdp;
let profileDirectory;
let downloadDirectory;

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
                if (message.method === 'Runtime.exceptionThrown') {
                    const details = message.params.exceptionDetails;
                    const exception = details?.exception?.description ?? details?.text ?? 'Chrome raised a JavaScript exception.';
                    const location = details?.exceptionMetaData?.url ?? details?.url ?? '';
                    browserErrors.push(`${exception}${location ? ` (${location})` : ''}`);
                }
                if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
                    const detail = (message.params.args ?? []).map((item) => item.value ?? item.description ?? '').join(' ');
                    browserErrors.push(`Chrome console error: ${detail}`);
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

    close() { this.socket.close(); }
}

function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

function provision(command, ...args) {
    try {
        execFileSync(phpPath, ['artisan', command, ...args], { cwd: projectRoot, stdio: 'ignore' });
    } catch {
        throw new Error(`Local P13 fixture provisioning failed: ${command}.`);
    }
}

function expectStatus(response, status, action) {
    assert.equal(response.status, status, `${action} returned ${response.status}: ${JSON.stringify(response.body)}`);
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
        body: document.body?.innerText?.slice(0, 1200) ?? '',
        importStatus: document.querySelector('.p13-status-message')?.textContent ?? null,
        selectedFile: document.querySelector('.p13-file-field small')?.textContent ?? null,
        importRows: document.querySelectorAll('[data-testid^="p13-import-row-"]').length,
        searchValue: document.querySelector('.search-field input')?.value ?? null,
        customerFilter: document.querySelector('.role-filter button[aria-pressed="true"]')?.textContent?.trim() ?? null,
        registerRows: document.querySelectorAll('.master-table tbody tr').length,
    })`);
    throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(snapshot)}; browser errors: ${JSON.stringify(browserErrors)}`);
}

async function waitForLoad(previousCount) {
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
    await waitForLoad(before);
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

async function fillInputByTyping(selector, value) {
    const focused = await cdp.evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) return false;
        element.focus();
        element.select?.();
        return true;
    })()`);
    assert.equal(focused, true, `Required input was not found: ${selector}`);
    await cdp.send('Input.insertText', { text: String(value) });
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
    const clicked = await cdp.evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element || element.hasAttribute('disabled')) return false;
        element.click();
        return true;
    })()`);
    assert.equal(clicked, true, `Required control was not found or was disabled: ${selector}`);
}

async function clickByText(selector, text) {
    const clicked = await cdp.evaluate(`(() => {
        const element = [...document.querySelectorAll(${JSON.stringify(selector)})]
            .find((item) => item.textContent?.trim() === ${JSON.stringify(text)});
        if (!element) return false;
        element.click();
        return true;
    })()`);
    assert.equal(clicked, true, `Required control was not found: ${text}`);
}

async function browserFetch(pathname, method = 'GET', body = undefined, extraHeaders = {}) {
    const csrf = method === 'GET' ? '' : await cdp.evaluate(`document.querySelector('meta[name="csrf-token"]')?.content ?? ''`);
    const options = {
        method,
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...(csrf ? { 'X-CSRF-TOKEN': csrf } : {}),
            ...extraHeaders,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
    const result = await cdp.evaluate(`(async () => {
        const response = await fetch(${JSON.stringify(pathname)}, ${JSON.stringify(options)});
        return { status: response.status, body: await response.text() };
    })()`);

    return { status: result.status, body: result.body ? JSON.parse(result.body) : null };
}

async function browserFetchText(pathname) {
    return cdp.evaluate(`(async () => {
        const response = await fetch(${JSON.stringify(pathname)}, { credentials: 'include', headers: { Accept: 'text/csv' } });
        return { status: response.status, body: await response.text() };
    })()`);
}

async function uploadFile(selector, filePath) {
    await cdp.send('DOM.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    assert.ok(nodeId, `File input was not found: ${selector}`);
    await cdp.send('DOM.setFileInputFiles', { files: [filePath], nodeId });
    await cdp.evaluate(`document.querySelector(${JSON.stringify(selector)})?.dispatchEvent(new Event('change', { bubbles: true }))`);
}

async function captureScreenshot(name, width, height) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await delay(250);
    if (!captureImages) return;
    const image = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    const filename = `p13-${name}-${stamp}.png`;
    await writeFile(path.join(screenshotDirectory, filename), Buffer.from(image.data, 'base64'));
    screenshots.push({ filename, width, height });
}

async function startBrowser() {
    profileDirectory = await mkdtemp(path.join(profileRoot, 'p13-'));
    const resolvedProfile = path.resolve(profileDirectory);
    assert.ok(resolvedProfile.startsWith(`${profileRoot}${path.sep}`), 'Chrome profile escaped the P13 temporary directory.');
    downloadDirectory = path.join(profileDirectory, 'downloads');
    await mkdir(downloadDirectory);

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
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDirectory });
}

async function signIn() {
    await navigate('/sign-in');
    await waitUntil('sign-in form', () => `Boolean(document.querySelector('#sign-in-email'))`);
    await setInput('#sign-in-email', credentials.email);
    await setInput('#sign-in-password', credentials.password);
    await cdp.evaluate(`document.querySelector('.auth-form')?.requestSubmit()`);
    await waitUntil('workspace after sign-in', () => `location.pathname === '/products'`);
    await waitUntil('workspace shell', () => `Boolean(document.querySelector('.workspace-account-bar'))`);
    const initialWorkspace = await browserFetch('/api/v1/workspace');
    expectStatus(initialWorkspace, 200, 'Read workspace organizations');
    const acceptanceOrganization = initialWorkspace.body.organizations.find((item) => item.name === 'سازمان پیش‌فرض');
    assert.ok(acceptanceOrganization?.id, 'The local acceptance organization is unavailable to the P03 editor.');
    expectStatus(await browserFetch('/api/v1/active-organization', 'POST', { organization_id: acceptanceOrganization.id }), 200, 'Select the local acceptance organization');
    const workspace = await browserFetch('/api/v1/workspace');
    expectStatus(workspace, 200, 'Read active organization');
    assert.equal(workspace.body.capabilities.membership_roles.manage, true, 'The synthetic editor was not explicitly provisioned as a role manager.');
    return workspace.body;
}

async function geometrySnapshot() {
    return cdp.evaluate(`(() => {
        const dockElement = document.querySelector('.mobile-focus-dock');
        const dockRect = dockElement?.getBoundingClientRect();
        const dock = dockRect && dockRect.width > 0 && dockRect.height > 0 ? dockRect : null;
        const focus = document.querySelector('[data-lg-role="focus"]')?.getBoundingClientRect();
        const styles = performance.getEntriesByType('resource').map((item) => item.name);
        return {
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            documentWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            documentHeight: document.documentElement.scrollHeight,
            focusBottom: focus?.bottom ?? null,
            dockTop: dock?.top ?? null,
            dockVisible: Boolean(dock),
            dockGap: focus && dock ? dock.top - focus.bottom : null,
            p13StyleLoaded: styles.some((item) => item.includes('/resources/css/p13.css')),
            viteClientLoaded: styles.some((item) => item.includes('/@vite/client')),
            brightScene: document.documentElement.dataset.lgScene === 'bright',
            glassSurfaces: document.querySelectorAll('.lg-surface').length,
            refractionSurfaces: [...document.querySelectorAll('.lg-surface')].filter((item) => item.classList.contains('lg-map-ready')
                && getComputedStyle(item).getPropertyValue('--lg-filter-url').trim() !== 'none').length,
        };
    })()`);
}

function csvField(value) {
    const text = String(value ?? '');
    return `"${text.replaceAll('"', '""')}"`;
}

function csvContent(rows) {
    const header = ['party_id', 'party_code', 'display_name', 'roles'];
    return `\uFEFF${[header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n')}\r\n`;
}

function parseCsv(text) {
    const input = text.startsWith('\uFEFF') ? text.slice(1) : text;
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;

    for (let index = 0; index < input.length; index += 1) {
        const char = input[index];
        if (quoted && char === '"' && input[index + 1] === '"') { field += '"'; index += 1; continue; }
        if (char === '"') { quoted = !quoted; continue; }
        if (!quoted && char === ',') { row.push(field); field = ''; continue; }
        if (!quoted && (char === '\r' || char === '\n')) {
            if (char === '\r' && input[index + 1] === '\n') index += 1;
            row.push(field); rows.push(row); row = []; field = ''; continue;
        }
        field += char;
    }
    if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }

    return rows;
}

function waitForDownload(beforeNames) {
    return (async () => {
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
            const names = await readdir(downloadDirectory);
            const result = names.find((name) => name.endsWith('.csv') && !beforeNames.has(name));
            if (result) return path.join(downloadDirectory, result);
            await delay(100);
        }
        throw new Error('The filtered party export did not download.');
    })();
}

let summary;
try {
    provision('organization:grant-role-manager', 'legacy-local', credentials.email, `--actor=${credentials.email}`);
    provision('p13:provision-browser-member', 'legacy-local', memberEmail);
    await startBrowser();
    const workspace = await signIn();
    const organization = workspace.active_organization;

    await navigate('/administration/memberships');
    await waitUntil('P13 membership list', () => `Boolean(document.querySelector('[data-testid="p13-memberships"]'))`);
    const memberResponse = await browserFetch('/api/v1/organization/memberships');
    expectStatus(memberResponse, 200, 'Read P13 membership list');
    const member = memberResponse.body.data.find((item) => item.email === memberEmail);
    assert.ok(member?.id, `P13 synthetic reader membership is missing from ${organization.name}; returned members: ${JSON.stringify(memberResponse.body.data.map((item) => ({ id: item.id, email: item.email, role: item.role })))}`);
    let history = await browserFetch(`/api/v1/organization/memberships/${member.id}/role-history`);
    expectStatus(history, 200, 'Read member history before the role change');

    if (member.role === 'reader') {
        await setSelect(`#p13-role-${member.id}`, 'editor');
        await waitUntil('role save enabled', () => `document.querySelector('[data-testid="p13-save-role-${member.id}"]')?.disabled === false`);
        await click(`[data-testid="p13-save-role-${member.id}"]`);
        await waitUntil('reader membership changed to editor', () => `document.querySelector('[data-testid="p13-member-${member.id}"] .p13-role-editor')?.textContent?.includes('ویرایشگر')`);
    } else {
        assert.equal(member.role, 'editor', 'The P13 fixture must be a reader before its first accepted change.');
        assert.equal(history.body.data.length, 1, 'A resumed P13 fixture must retain exactly one role-change event.');
        assert.equal(history.body.data[0].prior_role, 'reader');
        assert.equal(history.body.data[0].new_role, 'editor');
    }
    await click(`[data-testid="p13-member-${member.id}"] .p13-text-button`);
    await waitUntil('scoped role history visible', () => `Boolean(document.querySelector('[data-testid="p13-role-history"]'))`);
    await waitUntil('actual actor and role history visible', () => `document.querySelector('[data-testid="p13-role-history"] .p13-history-list li')?.textContent?.includes(${JSON.stringify(credentials.email)})`);
    history = await browserFetch(`/api/v1/organization/memberships/${member.id}/role-history`);
    expectStatus(history, 200, 'Read role history');
    assert.equal(history.body.data.length, 1);
    assert.equal(history.body.data[0].prior_role, 'reader');
    assert.equal(history.body.data[0].new_role, 'editor');
    assert.equal(history.body.data[0].actor.email, credentials.email);
    const noOp = await browserFetch(`/api/v1/organization/memberships/${member.id}/role`, 'PATCH', { expected_role: 'editor', role: 'editor' });
    expectStatus(noOp, 200, 'Repeat the unchanged role');
    assert.equal(noOp.body.changed, false);
    assert.equal((await browserFetch(`/api/v1/organization/memberships/${member.id}/role-history`)).body.data.length, 1);
    await captureScreenshot('role-history-desktop', 1280, 900);
    await cdp.evaluate(`document.querySelector('[data-testid="p13-role-history"]')?.scrollIntoView({ block: 'center' })`);
    await delay(200);
    await captureScreenshot('role-history-audit-detail-desktop', 1280, 900);

    await navigate('/parties');
    await waitUntil('P04 party register', () => `Boolean(document.querySelector('.master-table'))`);
    const existingLookup = await browserFetch(`/api/v1/parties?q=${encodeURIComponent(existingCode)}`);
    expectStatus(existingLookup, 200, 'Check for a prior synthetic duplicate fixture');
    let existingParty = existingLookup.body.data.find((item) => item.code === existingCode);
    if (existingParty) {
        assert.equal(existingParty.display_name, `P13 طرف موجود ${nonce}`);
        assert.ok(existingParty.roles.includes('customer'));
    } else {
        const createdExisting = await browserFetch('/api/v1/parties', 'POST', {
            code: existingCode,
            display_name: `P13 طرف موجود ${nonce}`,
            roles: ['customer'],
        });
        expectStatus(createdExisting, 201, 'Create a synthetic existing party for duplicate preview');
        existingParty = createdExisting.body.data;
    }

    const formulaCode = `P13-FORMULA-${nonce}`;
    const formulaLookup = await browserFetch(`/api/v1/parties?q=${encodeURIComponent(formulaCode)}`);
    expectStatus(formulaLookup, 200, 'Check for a prior synthetic formula-safe export fixture');
    let formulaParty = formulaLookup.body.data.find((item) => item.code === formulaCode);
    if (formulaParty) {
        assert.equal(formulaParty.display_name, `=HYPERLINK("x","P13 formula ${nonce}")`);
    } else {
        const createdFormula = await browserFetch('/api/v1/parties', 'POST', {
            code: formulaCode,
            display_name: `=HYPERLINK("x","P13 formula ${nonce}")`,
            roles: ['customer'],
        });
        expectStatus(createdFormula, 201, 'Create a synthetic spreadsheet-formula-like display name');
        formulaParty = createdFormula.body.data;
    }

    const csvRows = [
        ['', `00021-${nonce}`, `P13 طرف معتبر ${nonce}`, 'customer|supplier'],
        ['', `p13-exist-${nonce}`, `P13 طرف تکراری ${nonce}`, 'customer'],
        ['', `P13-INVALID-${nonce}`, `P13 طرف نامعتبر ${nonce}`, 'buyer'],
        ['', `00021-${nonce}`, `P13 تکرار فایل ${nonce}`, 'supplier'],
        ['', `P13-OTHER-${nonce}`, `P13 طرف دیگر ${nonce}`, 'customer'],
    ];
    const csvPath = path.join(profileDirectory, `p13-import-${nonce}.csv`);
    const xlsxPath = path.join(profileDirectory, `p13-import-${nonce}.xlsx`);
    await writeFile(csvPath, csvContent(csvRows), 'utf8');
    execFileSync(phpPath, [path.join(projectRoot, 'scripts', 'Create-P13ImportFixture.php'), xlsxPath, nonce], { cwd: projectRoot, stdio: 'ignore' });

    await click('[data-testid="p13-party-import-open"]');
    await uploadFile('#p13-import-file', csvPath);
    await waitUntil('CSV file selected', () => `document.querySelector('#p13-import-file')?.files?.length === 1`);
    await waitUntil('CSV selection cleared the old preview', () => `document.querySelectorAll('[data-testid^="p13-import-row-"]').length === 0`);
    await waitUntil('CSV preview control enabled', () => `document.querySelector('[data-testid="p13-import-preview"]')?.disabled === false`);
    await click('[data-testid="p13-import-preview"]');
    await waitUntil('CSV preview row outcomes', () => `document.querySelectorAll('[data-testid^="p13-import-row-"]').length === 5`);
    const csvOutcomes = await cdp.evaluate(`([...document.querySelectorAll('[data-testid^="p13-import-row-"]')].map((row) => ({ className: row.className, text: row.innerText })))`);
    assert.equal(csvOutcomes[0].className, 'p13-row-valid');
    assert.equal(csvOutcomes[1].className, 'p13-row-duplicate');
    assert.equal(csvOutcomes[2].className, 'p13-row-invalid');
    assert.equal(csvOutcomes[3].className, 'p13-row-duplicate');
    assert.equal(csvOutcomes[4].className, 'p13-row-valid');
    await captureScreenshot('party-import-preview-desktop', 1280, 900);

    await uploadFile('#p13-import-file', xlsxPath);
    await waitUntil('XLSX file selected', () => `document.querySelector('#p13-import-file')?.files?.length === 1`);
    await waitUntil('XLSX filename shown', () => `document.querySelector('.p13-file-field small')?.textContent?.includes(${JSON.stringify(path.basename(xlsxPath))})`);
    await waitUntil('XLSX selection cleared the old preview', () => `document.querySelectorAll('[data-testid^="p13-import-row-"]').length === 0`);
    await waitUntil('XLSX preview control enabled', () => `document.querySelector('[data-testid="p13-import-preview"]')?.disabled === false`);
    await click('[data-testid="p13-import-preview"]');
    await waitUntil('XLSX preview row outcomes', () => `document.querySelectorAll('[data-testid^="p13-import-row-"]').length === 5`);
    const xlsxOutcomes = await cdp.evaluate(`([...document.querySelectorAll('[data-testid^="p13-import-row-"]')].map((row) => ({ className: row.className, text: row.innerText })))`);
    assert.deepEqual(xlsxOutcomes, csvOutcomes, 'CSV and XLSX browser previews did not match.');

    await uploadFile('#p13-import-file', csvPath);
    await waitUntil('CSV retry file selected', () => `document.querySelector('#p13-import-file')?.files?.length === 1`);
    await waitUntil('CSV retry selection cleared the old preview', () => `document.querySelectorAll('[data-testid^="p13-import-row-"]').length === 0`);
    await waitUntil('CSV preview control enabled before apply', () => `document.querySelector('[data-testid="p13-import-preview"]')?.disabled === false`);
    await click('[data-testid="p13-import-preview"]');
    await waitUntil('CSV preview before apply', () => `document.querySelectorAll('[data-testid^="p13-import-row-"]').length === 5`);
    await click('[data-testid="p13-import-apply"]');
    await waitUntil('party import results', () => `document.querySelector('.p13-import-counts')?.textContent?.includes('ثبت‌شده')`);
    await waitUntil('two imported party rows', () => `document.querySelectorAll('.p13-import-table .p13-outcome-created').length === 2`);
    await captureScreenshot('party-import-result-desktop', 1280, 900);

    const importedResponse = await browserFetch('/api/v1/parties?q=P13&role=customer');
    expectStatus(importedResponse, 200, 'Read filtered party register');
    const registerIds = importedResponse.body.data.map((item) => item.id);
    const fullRegister = await browserFetch('/api/v1/parties');
    expectStatus(fullRegister, 200, 'Read full party register after apply');
    await waitUntil(`party register refreshed to ${fullRegister.body.data.length} rows`, () => `document.querySelectorAll('.master-table tbody tr').length === ${fullRegister.body.data.length}`);
    const exportPath = `/api/v1/parties/export?q=${encodeURIComponent('P13')}&role=customer`;
    const exportText = await browserFetchText(exportPath);
    expectStatus(exportText, 200, 'Read filtered party CSV');
    const exportRows = parseCsv(exportText.body);
    assert.deepEqual(exportRows.slice(1).map((row) => Number(row[0])), registerIds);
    const exportedCodes = exportRows.slice(1).map((row) => row[1]);
    assert.ok(exportedCodes.includes(`00021-${nonce}`), 'Export changed the leading-zero party code.');
    const formulaRow = exportRows.find((row) => row[1] === `P13-FORMULA-${nonce}`);
    assert.equal(formulaRow?.[2], `'=HYPERLINK("x","P13 formula ${nonce}")`);

    await click('[data-testid="p13-import-close"]');
    await waitUntil('party import panel closed', () => `document.querySelector('.p13-import-panel')?.hidden === true`);
    await fillInputByTyping('.search-field input', 'P13');
    await waitUntil('party search value', () => `document.querySelector('.search-field input')?.value === 'P13'`);
    await clickByText('.role-filter button', 'مشتری');
    await waitUntil('UI register search and customer filter', () => `document.querySelectorAll('.master-table tbody tr').length === ${registerIds.length}`);
    const uiIds = await cdp.evaluate(`([...document.querySelectorAll('.master-table tbody th a[href^="/parties/"]')]
        .map((item) => Number(item.getAttribute('href').split('/').pop())))`);
    assert.deepEqual(uiIds, registerIds, 'The visible party register and API filter population differ.');
    const geometry = await geometrySnapshot();
    assert.ok(geometry.documentWidth <= geometry.clientWidth, `Party register has horizontal overflow: ${JSON.stringify(geometry)}`);
    assert.equal(geometry.p13StyleLoaded, true, 'The live P13 stylesheet did not load.');
    assert.equal(geometry.viteClientLoaded, true, 'The live Vite client was not loaded.');
    await captureScreenshot('filtered-party-export-desktop', 1280, 900);

    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDirectory });
    const beforeDownloads = new Set(await readdir(downloadDirectory));
    await click('[data-testid="p13-party-export"]');
    const downloadedPath = await waitForDownload(beforeDownloads);
    const downloaded = parseCsv(await readFile(downloadedPath, 'utf8'));
    assert.deepEqual(downloaded.slice(1).map((row) => Number(row[0])), registerIds);

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await delay(250);
    await cdp.evaluate('window.scrollTo(0, 0)');
    await captureScreenshot('filtered-party-export-mobile', 390, 844);
    await cdp.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
    await delay(200);
    const mobileGeometry = await geometrySnapshot();
    assert.ok(mobileGeometry.documentWidth <= mobileGeometry.clientWidth, `Mobile party view overflows: ${JSON.stringify(mobileGeometry)}`);
    assert.ok((mobileGeometry.dockGap ?? -1) >= 0, `Mobile party view overlaps its dock: ${JSON.stringify(mobileGeometry)}`);

    await navigate('/parties?glass=fallback&scene=bright');
    await waitUntil('bright forced-fallback party register', () => `Boolean(document.querySelector('.master-table'))`);
    await click('[data-testid="p13-party-import-open"]');
    await uploadFile('#p13-import-file', csvPath);
    await waitUntil('fallback CSV file selected', () => `document.querySelector('#p13-import-file')?.files?.length === 1`);
    await waitUntil('fallback selection cleared the old preview', () => `document.querySelectorAll('[data-testid^="p13-import-row-"]').length === 0`);
    await waitUntil('fallback preview control enabled', () => `document.querySelector('[data-testid="p13-import-preview"]')?.disabled === false`);
    await click('[data-testid="p13-import-preview"]');
    await waitUntil('bright fallback preview', () => `document.querySelectorAll('[data-testid^="p13-import-row-"]').length === 5`);
    await cdp.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
    await delay(200);
    const fallback = await geometrySnapshot();
    assert.equal(fallback.brightScene, true);
    assert.ok(fallback.glassSurfaces > 0, 'The bright forced-fallback workspace has no shared glass controls.');
    assert.equal(fallback.refractionSurfaces, 0, 'P13 forced fallback left SVG refraction active.');
    assert.equal(fallback.p13StyleLoaded, true, 'The P13 stylesheet was not loaded in forced fallback.');
    assert.ok(fallback.documentWidth <= fallback.clientWidth, `Bright fallback has horizontal overflow: ${JSON.stringify(fallback)}`);
    assert.ok((fallback.dockGap ?? -1) >= 0, `Bright fallback overlaps its dock: ${JSON.stringify(fallback)}`);
    await captureScreenshot('bright-fallback-mobile', 390, 844);

    await cdp.evaluate('document.activeElement?.blur(); window.scrollTo(0, 0)');
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    const visibleFocus = await cdp.evaluate(`(() => {
        const element = document.activeElement;
        const style = element ? getComputedStyle(element) : null;
        return { tag: element?.tagName ?? null, outlineStyle: style?.outlineStyle ?? null, outlineWidth: style?.outlineWidth ?? null };
    })()`);
    assert.ok(visibleFocus.outlineStyle !== 'none' && visibleFocus.outlineWidth !== '0px', `Keyboard focus is not visible: ${JSON.stringify(visibleFocus)}`);
    assert.equal(browserErrors.length, 0, `Chrome reported runtime or network errors: ${browserErrors.join('; ')}`);

    summary = {
        status: 'passed',
        organization: organization.name,
        roleChange: { subjectId: member.id, before: 'reader', after: 'editor', auditEvents: history.body.data.length, replayCreatedAudit: noOp.body.changed },
        import: { csvAndXlsxPreviewRows: csvOutcomes.length, acceptedCreated: 2, counts: { valid: 2, duplicate: 2, invalid: 1 } },
        export: { filteredIds: registerIds, downloadedIds: downloaded.slice(1).map((row) => Number(row[0])), leadingZeroCodePreserved: exportedCodes.includes(`00021-${nonce}`), formulaTextEscaped: true },
        desktop: geometry,
        mobile: mobileGeometry,
        forcedFallback: fallback,
        visibleFocus,
        screenshots,
        runtimeErrors: browserErrors.length,
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} finally {
    cdp?.close();
    if (keepOpen) {
        browserProcess?.unref();
        process.stdout.write('Chrome was left open for review.\n');
    } else {
        if (browserProcess && browserProcess.exitCode === null) {
            browserProcess.kill();
            await Promise.race([
                new Promise((resolve) => browserProcess.once('exit', resolve)),
                delay(5000),
            ]);
        }
        if (profileDirectory && browserProcess?.exitCode !== null) {
            const resolved = path.resolve(profileDirectory);
            if (resolved.startsWith(`${profileRoot}${path.sep}`)) {
                try { await rm(resolved, { recursive: true, force: true }); } catch { /* Preserve an in-use diagnostic profile. */ }
            }
        }
    }
}
