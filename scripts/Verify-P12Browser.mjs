import assert from 'node:assert/strict';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.P12_BROWSER_BASE_URL ?? 'http://127.0.0.1:8000';
const browserPath = process.env.P12_BROWSER_EXECUTABLE ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const p03CredentialsPath = path.join(projectRoot, 'storage', 'app', 'private', 'p03-demo-credentials.json');
const p08CredentialsPath = path.join(projectRoot, 'storage', 'app', 'private', 'p08-approver-credentials.json');
const screenshotDirectory = path.join(projectRoot, 'docs', 'screenshots');
const profileRoot = path.resolve(os.tmpdir(), 'erp-p12-browser');
const stamp = process.env.P12_SCREENSHOT_STAMP ?? new Date().toISOString().replace(/[:.]/g, '-');
const headless = process.env.P12_BROWSER_HEADLESS !== '0';
const keepOpen = process.env.P12_BROWSER_KEEP_OPEN === '1';
const captureImages = process.env.P12_CAPTURE_SCREENSHOTS !== '0';
const p03Credentials = JSON.parse(await readFile(p03CredentialsPath, 'utf8')).editor;
const p08Credentials = JSON.parse(await readFile(p08CredentialsPath, 'utf8')).approver;
assert.ok(p03Credentials?.email && p03Credentials?.password, 'Local P03 editor credentials are unavailable.');
assert.ok(p08Credentials?.email && p08Credentials?.password, 'Local P08 approver credentials are unavailable.');
await access(browserPath);
await mkdir(profileRoot, { recursive: true });
await mkdir(screenshotDirectory, { recursive: true });

const profileDirectory = await mkdtemp(path.join(profileRoot, 'p12-browser-'));
const resolvedProfile = path.resolve(profileDirectory);
assert.ok(resolvedProfile.startsWith(`${profileRoot}${path.sep}`), 'Chrome profile escaped the P12 temporary directory.');

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
                if (message.method === 'Runtime.exceptionThrown') {
                    browserErrors.push(message.params.exceptionDetails?.text ?? 'Chrome raised a JavaScript exception.');
                }
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
    const snapshot = await cdp.evaluate(`({ path: location.pathname, title: document.title, body: document.body?.innerText?.slice(0, 600) ?? '' })`);
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
    if (!changed) {
        const snapshot = await cdp.evaluate(`({
            path: location.pathname,
            role: document.querySelector('.role-badge')?.textContent?.trim() ?? null,
            taskDetail: document.querySelector('[data-testid="p12-task-detail"]')?.innerText?.slice(0, 800) ?? null,
            workTaskEdit: Boolean(document.querySelector('.work-task-edit')),
            body: document.body?.innerText?.slice(-600) ?? '',
        })`);
        throw new Error(`Required input was not found: ${selector}; page state: ${JSON.stringify(snapshot)}`);
    }
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
        if (!element) return false;
        element.click();
        return true;
    })()`);
    assert.equal(clicked, true, `Required control was not found: ${selector}`);
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

async function submitForm(selector) {
    const submitted = await cdp.evaluate(`(() => {
        const form = document.querySelector(${JSON.stringify(selector)});
        if (!form) return false;
        form.requestSubmit();
        return true;
    })()`);
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
    await delay(250);
    if (!captureImages) return;
    const image = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
    });
    const filename = `p12-${name}-${stamp}.png`;
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

async function signIn(credentials) {
    await navigate('/sign-in');
    await waitUntil('sign-in form', () => `Boolean(document.querySelector('#sign-in-email'))`);
    await setInput('#sign-in-email', credentials.email);
    await setInput('#sign-in-password', credentials.password);
    await submitForm('.auth-form');
    await waitUntil('workspace after sign-in', () => `location.pathname === '/products'`);
    await waitUntil('workspace shell', () => `Boolean(document.querySelector('.workspace-account-bar'))`);
    const context = await browserFetch('/api/v1/workspace');
    expectStatus(context, 200, 'Read active organization');
    return context.body;
}

async function signOut() {
    await click('.sign-out-button');
    await waitUntil('signed-out route', () => `location.pathname === '/sign-in'`);
}

async function navigateToP12Project(projectId) {
    await navigate(`/projects/${projectId}`);
    await waitUntil('P12 project detail', () => `Boolean(document.querySelector('[data-testid="p12-project-detail"]'))`);
}

async function viewportSnapshot() {
    return cdp.evaluate(`(() => {
        const stage = document.querySelector('[data-lg-role="stage"]');
        const focus = document.querySelector('[data-testid="p12-inbox"], [data-testid="p12-project-detail"]');
        const dock = document.querySelector('.mobile-focus-dock');
        const focusRect = focus?.getBoundingClientRect();
        const dockRect = dock?.getBoundingClientRect();
        const dockLinks = [...(dock?.querySelectorAll('a') ?? [])].map((item) => item.textContent?.trim() ?? '');
        return {
            viewportWidth: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            stage: Boolean(stage),
            dockVisible: Boolean(dock && dockRect && dockRect.width > 0 && dockRect.height > 0),
            dockLinks,
            dockGap: focusRect && dockRect ? dockRect.top - focusRect.bottom : null,
        };
    })()`);
}

let summary;
try {
    await startBrowser();

    const p08Workspace = await signIn(p08Credentials);
    const p08OptionsResponse = await browserFetch('/api/v1/projects/options');
    expectStatus(p08OptionsResponse, 200, 'Read P08 assignee options');
    assert.equal(p08OptionsResponse.body.can_manage, true, 'The P08 approver is not an editor in the active organization.');
    const assignedUserId = p08OptionsResponse.body.current_user_id;
    const assignedMember = p08OptionsResponse.body.data.members.find((member) => member.id === assignedUserId && member.role === 'editor');
    assert.ok(assignedMember, 'The independent P08 editor is not an eligible P12 assignee.');
    const organizationId = p08Workspace.active_organization.id;
    const organizationName = p08Workspace.active_organization.name;
    await signOut();

    const p03Workspace = await signIn(p03Credentials);
    if (p03Workspace.active_organization.id !== organizationId) {
        expectStatus(await browserFetch('/api/v1/active-organization', 'POST', { organization_id: organizationId }), 200, 'Select the acceptance organization');
    }
    const editorOptionsResponse = await browserFetch('/api/v1/projects/options');
    expectStatus(editorOptionsResponse, 200, 'Read editor assignment options');
    assert.equal(editorOptionsResponse.body.can_manage, true, 'The P03 editor cannot manage P12 work.');
    assert.equal(editorOptionsResponse.body.current_user_id !== assignedUserId, true, 'The acceptance actors must be different editors.');
    assert.ok(editorOptionsResponse.body.data.members.some((member) => member.id === assignedUserId && member.role === 'editor'));

    const projectTitle = 'پذیرش مرورگر P12';
    const taskTitle = 'وظیفهٔ محول‌شدهٔ P12';
    const projectComment = 'دیدگاه متنی پذیرش P12';
    const taskComment = 'یادداشت وظیفهٔ P12';
    let projectsResponse = await browserFetch(`/api/v1/projects?q=${encodeURIComponent(projectTitle)}`);
    expectStatus(projectsResponse, 200, 'Search for reusable P12 acceptance project');
    let project = projectsResponse.body.data.find((item) => item.title === projectTitle);

    if (project === undefined) {
        await navigate('/projects');
        await waitUntil('P12 project list', () => `Boolean(document.querySelector('[data-testid="p12-project-list"]'))`);
        await setInput('.work-project-create input[name="title"]', projectTitle);
        await setInput('.work-project-create input[name="description"]', 'دادهٔ ساختگی برای پذیرش مرورگر P12.');
        await submitForm('.work-project-create');
        await waitUntil('created P12 project detail', () => `location.pathname.startsWith('/projects/') && location.pathname.split('/').length === 3`);
        await waitUntil('created project screen', () => `Boolean(document.querySelector('[data-testid="p12-project-detail"]'))`);
        const projectId = Number((await cdp.evaluate('location.pathname')).split('/').at(-1));
        projectsResponse = await browserFetch(`/api/v1/projects/${projectId}`);
        expectStatus(projectsResponse, 200, 'Read created P12 project');
        project = projectsResponse.body.data;
    }

    await navigateToP12Project(project.id);
    let projectRead = await browserFetch(`/api/v1/projects/${project.id}`);
    expectStatus(projectRead, 200, 'Read P12 project');
    project = projectRead.body.data;
    const workOptions = editorOptionsResponse.body.data;
    const p11PurchaseLine = workOptions.eligible_purchase_lines.find((line) => line.id === 9 && line.purchase_order_code === 'PO-000009');
    assert.ok(p11PurchaseLine, 'The existing P11 purchase line 9 is not eligible for the P12 trace.');
    assert.equal(p11PurchaseLine.amount_rial, '500000', 'The P11 source line must retain its exact 500,000-rial snapshot.');

    let task = project.tasks.find((item) => item.title === taskTitle);
    if (task === undefined) {
        await setInput('.work-task-create input[name="title"]', taskTitle);
        await setInput('.work-task-create input[name="due_on"]', workOptions.today);
        await setSelect('.work-task-create select[name="assignee_user_id"]', assignedUserId);
        await submitForm('.work-task-create');
        await waitUntil('assigned P12 task', () => `document.querySelector('[data-testid="p12-list"]')?.textContent?.includes(${JSON.stringify(taskTitle)})`);
        projectRead = await browserFetch(`/api/v1/projects/${project.id}`);
        expectStatus(projectRead, 200, 'Read created P12 task');
        project = projectRead.body.data;
        task = project.tasks.find((item) => item.title === taskTitle);
    } else {
        await navigate(`/projects/${project.id}/tasks/${task.id}`);
        await waitUntil('reusable P12 task detail', () => `Boolean(document.querySelector('[data-testid="p12-task-detail"]'))`);
        const currentStatus = await cdp.evaluate(`document.querySelector('[data-testid="p12-task-status"]')?.textContent?.trim()`);
        if (currentStatus === 'تکمیل‌شده') {
            await click('[data-testid="p12-task-transition-open"]');
            await waitUntil('reopened P12 task', () => `document.querySelector('[data-testid="p12-task-status"]')?.textContent?.trim() === 'باز'`);
        }
        await waitUntil('task editing form', () => `Boolean(document.querySelector('.work-task-edit input[name="title"]'))`);
        await setInput('.work-task-edit input[name="title"]', taskTitle);
        await setInput('.work-task-edit input[name="due_on"]', workOptions.today);
        await setSelect('.work-task-edit select[name="assignee_user_id"]', assignedUserId);
        await submitForm('.work-task-edit');
        await waitUntil('updated P12 task', () => `Boolean(document.querySelector('[data-testid="p12-task-detail"]'))`);
        projectRead = await browserFetch(`/api/v1/projects/${project.id}`);
        expectStatus(projectRead, 200, 'Read updated P12 task');
        project = projectRead.body.data;
        task = project.tasks.find((item) => item.title === taskTitle);
    }
    assert.ok(task, 'P12 task was not found after creation or reuse.');
    assert.equal(task.assignee?.id, assignedUserId);
    assert.equal(task.due_on, workOptions.today);

    if (!project.comments.some((item) => item.body === projectComment)) {
        await navigateToP12Project(project.id);
        await setInput('.work-comment-form textarea[name="body"]', projectComment);
        await submitForm('.work-comment-form');
        await waitUntil('project comment', () => `document.querySelector('[data-testid="p12-comments"]')?.textContent?.includes(${JSON.stringify(projectComment)})`);
    }

    projectRead = await browserFetch(`/api/v1/projects/${project.id}`);
    expectStatus(projectRead, 200, 'Read P12 project comments and costs');
    project = projectRead.body.data;
    if (!project.purchase_costs.some((cost) => cost.purchase_order_line_id === p11PurchaseLine.id)) {
        await navigateToP12Project(project.id);
        await setSelect('.work-cost-link-form select[name="purchase_order_line_id"]', p11PurchaseLine.id);
        await submitForm('.work-cost-link-form');
        await waitUntil('linked P12 purchase cost', () => `Boolean(document.querySelector('[data-testid="p12-purchase-cost-${p11PurchaseLine.id}"]'))`);
    }

    projectRead = await browserFetch(`/api/v1/projects/${project.id}`);
    expectStatus(projectRead, 200, 'Reconcile committed P12 purchase amount');
    project = projectRead.body.data;
    assert.equal(project.committed_purchase_rial, '500000');
    assert.equal(project.purchase_costs.filter((cost) => cost.purchase_order_line_id === p11PurchaseLine.id).length, 1);
    const sourceUrl = project.purchase_costs.find((cost) => cost.purchase_order_line_id === p11PurchaseLine.id).source_url;
    await navigateToP12Project(project.id);
    await captureScreenshot('project-desktop', 1280, 900);
    await cdp.evaluate(`document.querySelector('.work-task-list-row')?.focus()`);
    await pressKey('Tab');
    const visibleFocus = await cdp.evaluate(`Boolean(document.activeElement?.matches(':focus-visible'))`);
    assert.equal(visibleFocus, true, 'Keyboard focus is not visible on the P12 project page.');

    const sourceLink = await cdp.evaluate(`(() => {
        const item = [...document.querySelectorAll('.work-source-link')].find((link) => link.getAttribute('href') === ${JSON.stringify(sourceUrl)});
        if (!item) return null;
        return { href: item.getAttribute('href') };
    })()`);
    assert.ok(sourceLink, 'The project cost has no purchase-line link.');
    await click(`.work-source-link[href=${JSON.stringify(sourceUrl)}]`);
    await waitUntil('linked purchase order page', () => `location.pathname === '/purchase-orders/${p11PurchaseLine.purchase_order_id}'`);
    await waitUntil('scrolled source purchase line', () => `Boolean(document.querySelector('#p08-purchase-line-${p11PurchaseLine.id}'))`);
    const sourceLineGeometry = await cdp.evaluate(`(() => {
        const line = document.querySelector('#p08-purchase-line-${p11PurchaseLine.id}');
        const rect = line?.getBoundingClientRect();
        return { visible: Boolean(rect && rect.top < innerHeight && rect.bottom > 0), top: rect?.top ?? null };
    })()`);
    assert.equal(sourceLineGeometry.visible, true, 'The purchase-line link did not reveal its source row.');
    await captureScreenshot('purchase-line-source-desktop', 1280, 900);

    await signOut();
    const assignedWorkspace = await signIn(p08Credentials);
    assert.equal(assignedWorkspace.active_organization.id, organizationId);
    const assignedOptions = await browserFetch('/api/v1/projects/options');
    expectStatus(assignedOptions, 200, 'Verify assigned editor session');
    assert.equal(assignedOptions.body.current_user_id, assignedUserId);

    await setViewport(390, 844);
    await navigate('/inbox');
    await waitUntil('P12 mobile inbox', () => `Boolean(document.querySelector('[data-testid="p12-inbox"]'))`);
    await waitUntil('due reminder materialized', () => `Boolean(document.querySelector('[data-testid="p12-reminder-${task.id}"]'))`);
    const dueInbox = await browserFetch('/api/v1/work/inbox');
    expectStatus(dueInbox, 200, 'Read assigned P12 inbox');
    assert.equal(dueInbox.body.open_count, 1);
    assert.equal(dueInbox.body.due_reminder_count, 1);
    const reminderIdentity = dueInbox.body.data.find((item) => item.id === task.id)?.due_reminder?.identity;
    assert.ok(reminderIdentity, 'The due reminder identity was not persisted.');
    const reminderRetries = [];
    reminderRetries.push((await browserFetch('/api/v1/work/inbox/process-due-reminders', 'POST', {})).body.created);
    reminderRetries.push((await browserFetch('/api/v1/work/inbox/process-due-reminders', 'POST', {})).body.created);
    assert.deepEqual(reminderRetries, [0, 0], 'Repeated due-reminder processing created another reminder.');
    const refreshedInbox = await browserFetch('/api/v1/work/inbox');
    expectStatus(refreshedInbox, 200, 'Refresh assigned P12 inbox');
    assert.equal(refreshedInbox.body.data.find((item) => item.id === task.id)?.due_reminder?.identity, reminderIdentity);
    assert.equal(refreshedInbox.body.due_reminder_count, 1);
    const inboxGeometry = await viewportSnapshot();
    assert.equal(inboxGeometry.viewportWidth, 390);
    assert.ok(inboxGeometry.documentWidth <= inboxGeometry.clientWidth, `P12 mobile inbox overflows: ${JSON.stringify(inboxGeometry)}`);
    assert.equal(inboxGeometry.dockVisible, true, 'P12 mobile navigation dock is not visible.');
    assert.ok(inboxGeometry.dockLinks.includes('پروژه‌ها') && inboxGeometry.dockLinks.includes('صندوق کار'), 'P12 mobile navigation is missing its project or inbox link.');
    await cdp.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
    await delay(200);
    const inboxEndGeometry = await viewportSnapshot();
    assert.ok((inboxEndGeometry.dockGap ?? -1) >= 0, `P12 mobile inbox overlaps the dock: ${JSON.stringify(inboxEndGeometry)}`);
    await cdp.evaluate('window.scrollTo(0, 0)');
    await captureScreenshot('assigned-inbox-mobile', 390, 844);

    await clickByText('.work-project-parent', projectTitle);
    await waitUntil('inbox parent project', () => `location.pathname === '/projects/${project.id}'`);
    await waitUntil('P12 project open count before completion', () => `document.querySelector('[data-testid="p12-count-open"]')?.textContent?.trim() === '۱'`);
    const beforeProject = await browserFetch(`/api/v1/projects/${project.id}`);
    expectStatus(beforeProject, 200, 'Read project before assigned completion');
    assert.equal(beforeProject.body.data.open_task_count, 1);
    assert.equal(beforeProject.body.data.task_counts.completed, 0);
    await click(`[data-testid="p12-task-row-${task.id}"]`);
    await waitUntil('assigned task detail', () => `location.pathname === '/projects/${project.id}/tasks/${task.id}'`);
    await waitUntil('assigned editor sees task', () => `Boolean(document.querySelector('[data-testid="p12-task-detail"]'))`);

    const taskDetailResponse = await browserFetch(`/api/v1/projects/${project.id}/tasks/${task.id}`);
    expectStatus(taskDetailResponse, 200, 'Read assigned P12 task');
    assert.equal(taskDetailResponse.body.data.task.assignee.id, assignedUserId);
    if (!taskDetailResponse.body.data.comments.some((item) => item.body === taskComment)) {
        await setInput('.work-comment-form textarea[name="body"]', taskComment);
        await submitForm('.work-comment-form');
        await waitUntil('task comment', () => `document.querySelector('[data-testid="p12-comments"]')?.textContent?.includes(${JSON.stringify(taskComment)})`);
    }
    await captureScreenshot('assigned-task-detail-mobile', 390, 844);
    await click('[data-testid="p12-task-complete"]');
    await waitUntil('assigned task completed', () => `document.querySelector('[data-testid="p12-task-status"]')?.textContent?.trim() === 'تکمیل‌شده'`);
    const completedTask = await browserFetch(`/api/v1/projects/${project.id}/tasks/${task.id}`);
    expectStatus(completedTask, 200, 'Verify assigned completion');
    assert.equal(completedTask.body.data.task.status, 'completed');
    assert.equal(completedTask.body.data.task.completed_by.id, assignedUserId);
    assert.ok(completedTask.body.data.task.completed_at);

    await navigate('/inbox');
    await waitUntil('refreshed empty assigned inbox', () => `Boolean(document.querySelector('[data-testid="p12-inbox"]'))`);
    const afterInbox = await browserFetch('/api/v1/work/inbox');
    expectStatus(afterInbox, 200, 'Refresh inbox after completion');
    assert.equal(afterInbox.body.open_count, 0);
    assert.equal(afterInbox.body.due_reminder_count, 0);
    assert.equal(afterInbox.body.data.some((item) => item.id === task.id), false);

    await navigateToP12Project(project.id);
    const afterProject = await browserFetch(`/api/v1/projects/${project.id}`);
    expectStatus(afterProject, 200, 'Reconcile project after task completion');
    assert.equal(afterProject.body.data.open_task_count, 0);
    assert.equal(afterProject.body.data.task_counts.completed, 1);
    assert.equal(afterProject.body.data.tasks.filter((item) => item.status !== 'completed').length, 0);
    await clickByText('.work-view-switch button', 'برد');
    await waitUntil('completed task in board', () => `Boolean(document.querySelector('[data-testid="p12-board"]'))`);
    const boardCounts = await cdp.evaluate(`(() => ({
        open: document.getElementById('work-column-open')?.closest('.work-board-column')?.querySelectorAll('.work-task-card').length ?? 0,
        inProgress: document.getElementById('work-column-in_progress')?.closest('.work-board-column')?.querySelectorAll('.work-task-card').length ?? 0,
        completed: document.getElementById('work-column-completed')?.closest('.work-board-column')?.querySelectorAll('.work-task-card').length ?? 0,
    }))()`);
    assert.deepEqual(boardCounts, { open: 0, inProgress: 0, completed: 1 });
    await clickByText('.work-view-switch button', 'فهرست');
    await waitUntil('completed task in list', () => `Boolean(document.querySelector('[data-testid="p12-list"]'))`);
    const listCounts = await cdp.evaluate(`(() => ({
        rows: document.querySelectorAll('[data-testid^="p12-task-row-"]').length,
        openCount: document.querySelector('[data-testid="p12-count-open"]')?.textContent?.trim(),
        completedCount: document.querySelector('[data-testid="p12-count-completed"]')?.textContent?.trim(),
    }))()`);
    assert.deepEqual(listCounts, { rows: 1, openCount: '۰', completedCount: '۱' });
    await captureScreenshot('completed-project-desktop', 1280, 900);

    await navigate(`/projects/${project.id}?glass=fallback&scene=bright`);
    await waitUntil('P12 bright forced fallback', () => `Boolean(document.querySelector('[data-testid="p12-project-detail"]'))`);
    await setViewport(390, 844);
    const fallback = await cdp.evaluate(`(() => {
        const surfaces = [...document.querySelectorAll('.lg-surface')];
        const activeRefractionSurfaces = surfaces.filter((item) => item.classList.contains('lg-map-ready')
            && getComputedStyle(item).getPropertyValue('--lg-filter-url').trim() !== 'none').length;
        const resources = performance.getEntriesByType('resource').map((item) => item.name);
        return {
            brightScene: document.documentElement.dataset.lgScene === 'bright',
            surfaces: surfaces.length,
            activeRefractionSurfaces,
            viteClientLoaded: resources.some((item) => item.includes('/@vite/client')),
            projectWorkStyleLoaded: resources.some((item) => item.includes('/resources/css/project-work.css')),
        };
    })()`);
    assert.equal(fallback.brightScene, true);
    assert.ok(fallback.surfaces > 0, 'The P12 forced-fallback view has no shared glass controls.');
    assert.equal(fallback.activeRefractionSurfaces, 0, 'P12 forced fallback applied SVG refraction.');
    assert.equal(fallback.viteClientLoaded, true, 'The live Vite client was not loaded.');
    assert.equal(fallback.projectWorkStyleLoaded, true, 'The live project-work stylesheet was not loaded.');
    await cdp.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
    await delay(150);
    const finalGeometry = await viewportSnapshot();
    assert.ok(finalGeometry.documentWidth <= finalGeometry.clientWidth, `P12 forced-fallback screen overflows: ${JSON.stringify(finalGeometry)}`);
    assert.ok((finalGeometry.dockGap ?? -1) >= 0, `P12 forced-fallback content overlaps the dock: ${JSON.stringify(finalGeometry)}`);
    await captureScreenshot('bright-fallback-mobile', 390, 844);
    assert.equal(browserErrors.length, 0, `Chrome reported runtime or network errors: ${browserErrors.join('; ')}`);

    summary = {
        organization: organizationName,
        project: { id: project.id, title: projectTitle },
        task: { id: task.id, title: taskTitle, dueOn: task.due_on, assignedEditorId: assignedUserId },
        assigneeJourney: { inboxBefore: dueInbox.body.open_count, projectBefore: beforeProject.body.data.open_task_count, projectAfter: afterProject.body.data.open_task_count, inboxAfter: afterInbox.body.open_count, completedBy: completedTask.body.data.task.completed_by.id },
        reminder: { dueCountBeforeCompletion: dueInbox.body.due_reminder_count, identity: reminderIdentity, repeatedProcessingCreated: reminderRetries, afterCompletion: afterInbox.body.due_reminder_count },
        purchaseTrace: { orderCode: p11PurchaseLine.purchase_order_code, lineId: p11PurchaseLine.id, amountRial: project.committed_purchase_rial, sourceUrl, sourceLineVisible: sourceLineGeometry.visible },
        taskViews: { board: boardCounts, list: listCounts },
        mobile: { inbox: inboxGeometry, inboxAtScrollEnd: inboxEndGeometry, final: finalGeometry },
        visibleFocus,
        forcedFallback: fallback,
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
        if (browserProcess?.exitCode !== null && resolvedProfile.startsWith(`${profileRoot}${path.sep}`)) {
            try { await rm(resolvedProfile, { recursive: true, force: true }); } catch { /* Preserve an in-use diagnostic profile. */ }
        }
    }
}
