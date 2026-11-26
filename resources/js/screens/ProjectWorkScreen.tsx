import { useEffect, useMemo, useState, type ButtonHTMLAttributes, type FormEvent, type ReactNode } from 'react';
import {
    addProjectComment,
    addTaskComment,
    createWorkProject,
    createWorkTask,
    fetchWorkInbox,
    fetchWorkOptions,
    fetchWorkProject,
    fetchWorkProjects,
    fetchWorkTask,
    linkPurchaseOrderLine,
    processDueWorkReminders,
    transitionWorkTask,
    updateWorkTask,
    WorkApiError,
    type ProjectPurchaseCost,
    type WorkComment,
    type WorkInbox,
    type WorkOptions,
    type WorkProject,
    type WorkProjectSummary,
    type WorkTask,
    type WorkTaskDetail,
    type WorkTaskStatus,
} from '../api/project-work';
import { fetchWorkspaceContext, selectOrganization, signOut, type WorkspaceContext } from '../api/products';
import { GlassButton } from '../components/GlassButton';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { AccessDeniedScreen } from './AccessDeniedScreen';

type Route = { kind: 'projects' } | { kind: 'project'; projectId: number } | { kind: 'task'; projectId: number; taskId: number } | { kind: 'inbox' };
type LoadState = 'loading' | 'ready' | 'error' | 'denied';
type TaskView = 'list' | 'board';

const statusLabels: Record<WorkTaskStatus, string> = {
    open: 'باز',
    in_progress: 'در حال انجام',
    completed: 'تکمیل‌شده',
};
const statuses: WorkTaskStatus[] = ['open', 'in_progress', 'completed'];

function routeFromLocation(): Route {
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    if (path === '/inbox') return { kind: 'inbox' };
    const taskMatch = path.match(/^\/projects\/(\d+)\/tasks\/(\d+)$/);
    if (taskMatch) return { kind: 'task', projectId: Number(taskMatch[1]), taskId: Number(taskMatch[2]) };
    const projectMatch = path.match(/^\/projects\/(\d+)$/);
    if (projectMatch) return { kind: 'project', projectId: Number(projectMatch[1]) };
    return { kind: 'projects' };
}

function exactNumber(value: string | number): string {
    const digits = String(value);
    const [whole, fraction] = digits.split('.', 2);
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
    const persian = (part: string) => part.replace(/[0-9]/g, (digit) => String.fromCharCode(0x06f0 + Number(digit)));
    return fraction ? `${persian(grouped)}٫${persian(fraction)}` : persian(grouped);
}

function shortDate(value: string | null): string {
    if (!value) return 'بدون سررسید';
    const date = new Date(`${value}T12:00:00.000Z`);
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    }).format(date);
}

function dateTime(value: string | null, timeZone: string): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        dateStyle: 'medium', timeStyle: 'short', timeZone,
    }).format(new Date(value));
}

function routeHref(projectId: number, taskId: number): string {
    return `/projects/${projectId}/tasks/${taskId}`;
}

function statusClass(status: WorkTaskStatus): string {
    return `work-status work-status-${status.replace('_', '-')}`;
}

function isDenied(cause: unknown): boolean {
    return cause instanceof WorkApiError && (cause.status === 401 || cause.status === 403);
}

function WorkButton({
    children,
    primary = false,
    className = '',
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; primary?: boolean }) {
    const forceFallback = new URLSearchParams(window.location.search).get('glass') === 'fallback';
    return <GlassButton variant={primary ? 'tinted' : 'regular'} className={`work-button${primary ? ' work-button-primary' : ''} ${className}`.trim()} forceFallback={forceFallback} {...props}>{children}</GlassButton>;
}

function CommentList({ comments, timeZone }: { comments: WorkComment[]; timeZone: string }) {
    if (comments.length === 0) return <p className="work-empty-note">هنوز دیدگاهی ثبت نشده است.</p>;
    return (
        <ol className="work-comments" data-testid="p12-comments">
            {comments.map((comment) => (
                <li className="work-comment" key={comment.id}>
                    <div className="work-comment-meta"><strong>{comment.author.name}</strong><time dateTime={comment.created_at ?? undefined}>{dateTime(comment.created_at, timeZone)}</time></div>
                    <p>{comment.body}</p>
                </li>
            ))}
        </ol>
    );
}

function CommentForm({ disabled, onSubmit, label }: { disabled: boolean; onSubmit: (body: string, form: HTMLFormElement) => Promise<void>; label: string }) {
    return (
        <form className="work-comment-form" onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const body = String(new FormData(form).get('body') ?? '');
            void onSubmit(body, form);
        }}>
            <label className="work-field work-field-wide">
                <span>{label}</span>
                <textarea name="body" rows={3} maxLength={2000} required disabled={disabled} />
            </label>
            <WorkButton type="submit" primary disabled={disabled}>ثبت دیدگاه</WorkButton>
        </form>
    );
}

function TaskCard({ task, projectId }: { task: WorkTask; projectId: number }) {
    return (
        <article className={`work-task-card${task.is_overdue ? ' is-overdue' : ''}`} data-testid={`p12-task-${task.id}`}>
            <a className="work-task-title" href={routeHref(projectId, task.id)}>{task.title}</a>
            <span className={statusClass(task.status)}>{statusLabels[task.status]}</span>
            <div className="work-task-meta">
                <span className={task.is_overdue ? 'work-due work-due-overdue' : 'work-due'}>{task.is_overdue ? 'عقب‌افتاده · ' : 'سررسید · '}{shortDate(task.due_on)}</span>
                <span>{task.assignee?.name ?? 'بدون مسئول'}</span>
            </div>
        </article>
    );
}

function ProjectList({
    projects,
    canManage,
    busy,
    onCreate,
}: {
    projects: WorkProjectSummary[];
    canManage: boolean;
    busy: boolean;
    onCreate: (title: string, description: string, form: HTMLFormElement) => Promise<void>;
}) {
    return (
        <section className="work-surface" data-lg-role="focus" data-testid="p12-project-list">
            <header className="work-page-heading">
                <div><p className="work-kicker">فضای هماهنگی · P12</p><h1>پروژه‌ها</h1><p>کارها، مسئولان، دیدگاه‌ها و مبالغ خرید مرتبط را در یک مسیر دنبال کنید.</p></div>
                <a className="work-count-link" href="/inbox"><span>صندوق کار</span><span aria-hidden="true">←</span></a>
            </header>

            {canManage && (
                <form className="work-project-create" onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const fields = new FormData(form);
                    void onCreate(String(fields.get('title') ?? ''), String(fields.get('description') ?? ''), form);
                }}>
                    <label className="work-field"><span>عنوان پروژه</span><input name="title" maxLength={200} required /></label>
                    <label className="work-field"><span>شرح کوتاه</span><input name="description" maxLength={5000} /></label>
                    <WorkButton type="submit" primary disabled={busy}>پروژهٔ تازه</WorkButton>
                </form>
            )}

            {projects.length === 0 ? <p className="work-empty-note">پروژه‌ای برای این جست‌وجو پیدا نشد.</p> : (
                <div className="work-project-grid">
                    {projects.map((project) => (
                        <article className="work-project-card" key={project.id} data-testid={`p12-project-${project.id}`}>
                            <div className="work-project-card-heading"><div><p className="work-kicker">پروژهٔ فعال</p><h2><a href={`/projects/${project.id}`}>{project.title}</a></h2></div><span className="work-overdue-pill">{exactNumber(project.overdue_count)} عقب‌افتاده</span></div>
                            {project.description && <p className="work-project-description">{project.description}</p>}
                            <div className="work-count-row" data-lg-role="rail">
                                <span><strong>{exactNumber(project.task_counts.open_total)}</strong> باز</span>
                                <span><strong>{exactNumber(project.task_counts.completed)}</strong> تکمیل‌شده</span>
                            </div>
                            <p className="work-project-cost">مبلغ خرید متعهدشده <bdi dir="ltr">{exactNumber(project.committed_purchase_rial)}</bdi> ریال</p>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
}

function TaskList({ tasks, projectId }: { tasks: WorkTask[]; projectId: number }) {
    return (
        <div className="work-task-list" data-testid="p12-list">
            <div className="work-task-list-head"><span>عنوان</span><span>وضعیت</span><span>سررسید</span><span>مسئول</span></div>
            {tasks.map((task) => (
                <a className={`work-task-list-row${task.is_overdue ? ' is-overdue' : ''}`} href={routeHref(projectId, task.id)} key={task.id} data-testid={`p12-task-row-${task.id}`}>
                    <strong>{task.title}</strong><span className={statusClass(task.status)}>{statusLabels[task.status]}</span>
                    <span className={task.is_overdue ? 'work-due work-due-overdue' : 'work-due'}>{shortDate(task.due_on)}</span><span>{task.assignee?.name ?? 'بدون مسئول'}</span>
                </a>
            ))}
            {tasks.length === 0 && <p className="work-empty-note">برای این وضعیت وظیفه‌ای وجود ندارد.</p>}
        </div>
    );
}

function TaskBoard({ tasks, projectId }: { tasks: WorkTask[]; projectId: number }) {
    return (
        <div className="work-task-board" data-testid="p12-board">
            {statuses.map((status) => {
                const column = tasks.filter((task) => task.status === status);
                return (
                    <section className="work-board-column" key={status} aria-labelledby={`work-column-${status}`}>
                        <header><h3 id={`work-column-${status}`}>{statusLabels[status]}</h3><span>{exactNumber(column.length)}</span></header>
                        <div className="work-board-items">{column.map((task) => <TaskCard task={task} projectId={projectId} key={task.id} />)}</div>
                    </section>
                );
            })}
        </div>
    );
}

function ProjectDetail({
    project,
    options,
    canManage,
    busy,
    view,
    onViewChange,
    onCreateTask,
    onComment,
    onLinkCost,
}: {
    project: WorkProject;
    options: WorkOptions | null;
    canManage: boolean;
    busy: boolean;
    view: TaskView;
    onViewChange: (view: TaskView) => void;
    onCreateTask: (input: { title: string; due_on: string | null; assignee_user_id: number | null }, form: HTMLFormElement) => Promise<void>;
    onComment: (body: string, form: HTMLFormElement) => Promise<void>;
    onLinkCost: (lineId: number, form: HTMLFormElement) => Promise<void>;
}) {
    const eligibleLines = useMemo(() => options?.eligible_purchase_lines.filter((line) => !project.purchase_costs.some((cost) => cost.purchase_order_line_id === line.id)) ?? [], [options, project.purchase_costs]);

    return (
        <section className="work-surface" data-lg-role="focus" data-testid="p12-project-detail">
            <header className="work-page-heading">
                <div><a className="work-back-link" href="/projects">پروژه‌ها</a><p className="work-kicker">جزئیات پروژه</p><h1>{project.title}</h1>{project.description && <p>{project.description}</p>}</div>
                <div className="work-project-total"><span>مبلغ خرید متعهدشده</span><strong data-testid="p12-purchase-cost-total"><bdi dir="ltr">{exactNumber(project.committed_purchase_rial)}</bdi> ریال</strong></div>
            </header>

            <div className="work-summary-rail" data-lg-role="rail">
                <div><span>باز</span><strong data-testid="p12-count-open">{exactNumber(project.open_task_count)}</strong></div>
                <div><span>تکمیل‌شده</span><strong data-testid="p12-count-completed">{exactNumber(project.task_counts.completed)}</strong></div>
                <div className={project.overdue_count > 0 ? 'is-warning' : ''}><span>عقب‌افتاده</span><strong data-testid="p12-count-overdue">{exactNumber(project.overdue_count)}</strong></div>
                <small>سررسیدها بر مبنای {project.time_zone} محاسبه می‌شوند.</small>
            </div>

            {canManage && (
                <form className="work-task-create" onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const fields = new FormData(form);
                    const assigneeValue = String(fields.get('assignee_user_id') ?? '');
                    void onCreateTask({
                        title: String(fields.get('title') ?? ''),
                        due_on: String(fields.get('due_on') ?? '') || null,
                        assignee_user_id: assigneeValue ? Number(assigneeValue) : null,
                    }, form);
                }}>
                    <label className="work-field"><span>عنوان وظیفه</span><input name="title" maxLength={200} required /></label>
                    <label className="work-field"><span>سررسید</span><input name="due_on" type="date" /></label>
                    <label className="work-field"><span>مسئول</span><select name="assignee_user_id" defaultValue=""><option value="">بدون مسئول</option>{(options?.members ?? []).map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role === 'editor' ? 'ویرایشگر' : 'خواننده'}</option>)}</select></label>
                    <WorkButton type="submit" primary disabled={busy}>افزودن وظیفه</WorkButton>
                </form>
            )}

            <section className="work-group" aria-labelledby="work-tasks-title">
                <header className="work-section-heading"><div><p className="work-kicker">همان داده، دو نما</p><h2 id="work-tasks-title">وظیفه‌ها</h2></div><div className="work-view-switch" role="group" aria-label="نمایش وظیفه‌ها">
                    <button type="button" className={view === 'list' ? 'is-current' : ''} aria-pressed={view === 'list'} onClick={() => onViewChange('list')}>فهرست</button>
                    <button type="button" className={view === 'board' ? 'is-current' : ''} aria-pressed={view === 'board'} onClick={() => onViewChange('board')}>برد</button>
                </div></header>
                {view === 'list' ? <TaskList tasks={project.tasks} projectId={project.id} /> : <TaskBoard tasks={project.tasks} projectId={project.id} />}
            </section>

            <section className="work-group" aria-labelledby="work-costs-title">
                <header className="work-section-heading"><div><p className="work-kicker">ردیابی خرید P08</p><h2 id="work-costs-title">مبالغ خرید متعهدشده</h2></div><strong className="work-section-total"><bdi dir="ltr">{exactNumber(project.committed_purchase_rial)}</bdi> ریال</strong></header>
                {project.purchase_costs.length > 0 && <ul className="work-cost-list">{project.purchase_costs.map((cost) => <CostRow cost={cost} key={cost.id} />)}</ul>}
                {project.purchase_costs.length === 0 && <p className="work-empty-note">هنوز ردیف خریدی به پروژه متصل نشده است.</p>}
                {canManage && <form className="work-cost-link-form" onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const lineId = Number(new FormData(form).get('purchase_order_line_id'));
                    if (lineId > 0) void onLinkCost(lineId, form);
                }}>
                    <label className="work-field work-field-wide"><span>ردیف سفارش خرید</span><select name="purchase_order_line_id" required defaultValue=""><option value="">انتخاب ردیف خرید</option>{eligibleLines.map((line) => <option key={line.id} value={line.id}>{line.purchase_order_code} · {line.product_name} · {exactNumber(line.amount_rial)} ریال</option>)}</select></label>
                    <WorkButton type="submit" primary disabled={busy || eligibleLines.length === 0}>اتصال ردیف به پروژه</WorkButton>
                </form>}
            </section>

            <section className="work-group" aria-labelledby="work-project-comments-title">
                <header className="work-section-heading"><div><p className="work-kicker">یادداشت متنی</p><h2 id="work-project-comments-title">دیدگاه‌های پروژه</h2></div></header>
                <CommentList comments={project.comments} timeZone={project.time_zone} />
                {canManage && <CommentForm disabled={busy} label="دیدگاه تازه برای پروژه" onSubmit={onComment} />}
            </section>
        </section>
    );
}

function CostRow({ cost }: { cost: ProjectPurchaseCost }) {
    return (
        <li className="work-cost-row" data-testid={`p12-purchase-cost-${cost.purchase_order_line_id}`}>
            <div><strong>{cost.product_name}</strong><span>{cost.supplier_name} · سفارش <bdi dir="ltr">{cost.purchase_order_code}</bdi></span></div>
            <strong className="work-cost-amount"><bdi dir="ltr">{exactNumber(cost.amount_rial)}</bdi> ریال</strong>
            <a className="work-source-link" href={cost.source_url}>بازکردن ردیف خرید <span aria-hidden="true">↗</span></a>
        </li>
    );
}

function TaskDetail({
    detail,
    options,
    canManage,
    busy,
    onTransition,
    onUpdate,
    onComment,
}: {
    detail: WorkTaskDetail;
    options: WorkOptions | null;
    canManage: boolean;
    busy: boolean;
    onTransition: (status: WorkTaskStatus) => Promise<void>;
    onUpdate: (input: { title: string; due_on: string | null; assignee_user_id: number | null }, form: HTMLFormElement) => Promise<void>;
    onComment: (body: string, form: HTMLFormElement) => Promise<void>;
}) {
    const task = detail.task;
    const allowedNext: WorkTaskStatus[] = task.status === 'open'
        ? ['in_progress', 'completed']
        : task.status === 'in_progress' ? ['open', 'completed'] : ['open'];

    return (
        <section className="work-surface" data-lg-role="focus" data-testid="p12-task-detail">
            <header className="work-page-heading">
                <div><a className="work-back-link" href={`/projects/${task.project_id}`}>{task.project?.title ?? 'پروژه'}</a><p className="work-kicker">جزئیات وظیفه</p><h1>{task.title}</h1></div>
                <span className={statusClass(task.status)} data-testid="p12-task-status">{statusLabels[task.status]}</span>
            </header>

            <dl className="work-task-facts" data-lg-role="rail">
                <div><dt>سررسید</dt><dd className={task.is_overdue ? 'work-due-overdue' : ''}>{shortDate(task.due_on)}{task.is_overdue ? ' · عقب‌افتاده' : ''}</dd></div>
                <div><dt>مسئول</dt><dd>{task.assignee?.name ?? 'بدون مسئول'}</dd></div>
                <div><dt>تکمیل‌کننده</dt><dd>{task.completed_by?.name ?? '—'}</dd></div>
                <div><dt>زمان تکمیل</dt><dd>{dateTime(task.completed_at, detail.time_zone)}</dd></div>
                <div><dt>منطقهٔ زمانی</dt><dd><bdi dir="ltr">{detail.time_zone}</bdi></dd></div>
            </dl>

            {canManage && <>
                <div className="work-transition-actions" role="group" aria-label="تغییر وضعیت وظیفه">
                    {allowedNext.map((status) => <WorkButton primary={status === 'completed'} type="button" key={status} disabled={busy} data-testid={status === 'completed' ? 'p12-task-complete' : `p12-task-transition-${status}`} onClick={() => void onTransition(status)}>{status === 'completed' ? 'تکمیل وظیفه' : status === 'open' ? 'بازگشایی' : 'شروع کار'}</WorkButton>)}
                </div>
                <form className="work-task-edit" onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const fields = new FormData(form);
                    const assigneeValue = String(fields.get('assignee_user_id') ?? '');
                    void onUpdate({
                        title: String(fields.get('title') ?? ''),
                        due_on: String(fields.get('due_on') ?? '') || null,
                        assignee_user_id: assigneeValue ? Number(assigneeValue) : null,
                    }, form);
                }}>
                    <label className="work-field"><span>عنوان</span><input name="title" maxLength={200} required defaultValue={task.title} /></label>
                    <label className="work-field"><span>سررسید</span><input name="due_on" type="date" defaultValue={task.due_on ?? ''} /></label>
                    <label className="work-field"><span>مسئول</span><select name="assignee_user_id" defaultValue={task.assignee?.id ?? ''}><option value="">بدون مسئول</option>{(options?.members ?? []).map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role === 'editor' ? 'ویرایشگر' : 'خواننده'}</option>)}</select></label>
                    <WorkButton type="submit" disabled={busy}>ذخیرهٔ تغییرات</WorkButton>
                </form>
            </>}

            <section className="work-group" aria-labelledby="work-task-comments-title">
                <header className="work-section-heading"><div><p className="work-kicker">گفت‌وگوی وظیفه</p><h2 id="work-task-comments-title">دیدگاه‌ها</h2></div></header>
                <CommentList comments={detail.comments} timeZone={detail.time_zone} />
                {canManage && <CommentForm disabled={busy} label="دیدگاه متنی تازه" onSubmit={onComment} />}
            </section>
        </section>
    );
}

function Inbox({ inbox }: { inbox: WorkInbox }) {
    return (
        <section className="work-surface" data-lg-role="focus" data-testid="p12-inbox">
            <header className="work-page-heading">
                <div><p className="work-kicker">کارهای محول‌شده · P12</p><h1>صندوق کار من</h1><p>وظیفه‌های بازِ محول‌شده به حساب کاربری شما در سازمان فعال.</p></div>
                <div className="work-inbox-counts" data-lg-role="rail"><span><strong data-testid="p12-inbox-open-count">{exactNumber(inbox.open_count)}</strong> کار باز</span><span><strong data-testid="p12-reminder-count">{exactNumber(inbox.due_reminder_count)}</strong> یادآور سررسید</span></div>
            </header>
            <p className="work-time-note">سررسید روزانه با منطقهٔ زمانی <bdi dir="ltr">{inbox.time_zone}</bdi> از ابتدای همان روز فعال می‌شود؛ وظیفه از روز بعد عقب‌افتاده است.</p>
            {inbox.data.length === 0 ? <p className="work-empty-note">وظیفهٔ بازی به شما محول نشده است.</p> : (
                <ol className="work-inbox-list">
                    {inbox.data.map((task) => (
                        <li className={`work-inbox-item${task.is_overdue ? ' is-overdue' : ''}`} key={task.id} data-testid={`p12-inbox-task-${task.id}`}>
                            <div className="work-inbox-item-main"><a className="work-task-title" href={routeHref(task.project_id, task.id)}>{task.title}</a><a className="work-project-parent" href={`/projects/${task.project_id}`}>{task.project?.title ?? 'پروژه'}</a><div className="work-task-meta"><span className={task.is_overdue ? 'work-due work-due-overdue' : 'work-due'}>{task.is_overdue ? 'عقب‌افتاده · ' : 'سررسید · '}{shortDate(task.due_on)}</span><span className={statusClass(task.status)}>{statusLabels[task.status]}</span></div></div>
                            {task.due_reminder && <span className="work-reminder-badge" data-testid={`p12-reminder-${task.id}`} title={`یادآور ثبت‌شده در ${dateTime(task.due_reminder.delivered_at, inbox.time_zone)}`}>یادآور سررسید</span>}
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}

export function ProjectWorkScreen() {
    const route = routeFromLocation();
    const routeKey = route.kind === 'task' ? `task:${route.projectId}:${route.taskId}` : route.kind === 'project' ? `project:${route.projectId}` : route.kind;
    const [loadState, setLoadState] = useState<LoadState>('loading');
    const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
    const [options, setOptions] = useState<WorkOptions | null>(null);
    const [projects, setProjects] = useState<WorkProjectSummary[]>([]);
    const [project, setProject] = useState<WorkProject | null>(null);
    const [taskDetail, setTaskDetail] = useState<WorkTaskDetail | null>(null);
    const [inbox, setInbox] = useState<WorkInbox | null>(null);
    const [query, setQuery] = useState('');
    const [search, setSearch] = useState('');
    const [view, setView] = useState<TaskView>('list');
    const [revision, setRevision] = useState(0);
    const [switchingOrganization, setSwitchingOrganization] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const forceFallback = new URLSearchParams(window.location.search).get('glass') === 'fallback';

    useEffect(() => {
        const controller = new AbortController();
        setLoadState('loading');
        setError('');
        setProject(null);
        setTaskDetail(null);
        setInbox(null);

        async function load() {
            try {
                const [nextWorkspace, nextOptions] = await Promise.all([
                    fetchWorkspaceContext(controller.signal),
                    fetchWorkOptions(controller.signal),
                ]);
                setWorkspace(nextWorkspace);
                setOptions(nextOptions);

                if (route.kind === 'projects') {
                    setProjects(await fetchWorkProjects(search, controller.signal));
                } else if (route.kind === 'project') {
                    setProject(await fetchWorkProject(route.projectId, controller.signal));
                } else if (route.kind === 'task') {
                    setTaskDetail(await fetchWorkTask(route.projectId, route.taskId, controller.signal));
                } else {
                    await processDueWorkReminders();
                    setInbox(await fetchWorkInbox(controller.signal));
                }
                if (!controller.signal.aborted) setLoadState('ready');
            } catch (cause) {
                if (controller.signal.aborted) return;
                setError(cause instanceof Error ? cause.message : 'بارگذاری فضای کار با خطا روبه‌رو شد.');
                setLoadState(isDenied(cause) ? 'denied' : 'error');
            }
        }

        void load();
        return () => controller.abort();
    }, [routeKey, search, revision]);

    async function runAction(action: () => Promise<unknown>, after?: () => void): Promise<boolean> {
        setBusy(true);
        setError('');
        try {
            await action();
            after?.();
            return true;
        } catch (cause) {
            if (isDenied(cause)) {
                setLoadState('denied');
            } else {
                setError(cause instanceof Error ? cause.message : 'ذخیره‌سازی انجام نشد.');
            }
            return false;
        } finally {
            setBusy(false);
        }
    }

    async function handleOrganizationChange(organizationId: number) {
        setSwitchingOrganization(true);
        try {
            await selectOrganization(organizationId);
            setRevision((current) => current + 1);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'تغییر سازمان انجام نشد.');
        } finally {
            setSwitchingOrganization(false);
        }
    }

    async function handleProjectCreate(title: string, description: string, form: HTMLFormElement) {
        const saved = await runAction(async () => {
            const created = await createWorkProject({ title, description });
            window.location.assign(`/projects/${created.id}`);
        });
        if (saved) form.reset();
    }

    async function handleTaskCreate(input: { title: string; due_on: string | null; assignee_user_id: number | null }, form: HTMLFormElement) {
        const saved = await runAction(async () => { await createWorkTask(project?.id ?? 0, input); }, () => setRevision((current) => current + 1));
        if (saved) form.reset();
    }

    async function handleProjectComment(body: string, form: HTMLFormElement) {
        const saved = await runAction(async () => { await addProjectComment(project?.id ?? 0, body); }, () => setRevision((current) => current + 1));
        if (saved) form.reset();
    }

    async function handleTaskComment(body: string, form: HTMLFormElement) {
        const projectId = route.kind === 'task' ? route.projectId : 0;
        const taskId = route.kind === 'task' ? route.taskId : 0;
        const saved = await runAction(async () => { await addTaskComment(projectId, taskId, body); }, () => setRevision((current) => current + 1));
        if (saved) form.reset();
    }

    async function handleTaskUpdate(input: { title: string; due_on: string | null; assignee_user_id: number | null }, _form: HTMLFormElement) {
        if (route.kind !== 'task') return;
        await runAction(async () => { await updateWorkTask(route.projectId, route.taskId, input); }, () => setRevision((current) => current + 1));
    }

    async function handleTaskTransition(status: WorkTaskStatus) {
        if (route.kind !== 'task') return;
        await runAction(async () => { await transitionWorkTask(route.projectId, route.taskId, status); }, () => setRevision((current) => current + 1));
    }

    async function handleCostLink(lineId: number, form: HTMLFormElement) {
        const saved = await runAction(async () => { await linkPurchaseOrderLine(project?.id ?? 0, lineId); }, () => setRevision((current) => current + 1));
        if (saved) form.reset();
    }

    async function handleSignOut() {
        try {
            await signOut();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'خروج از حساب انجام نشد.');
        }
    }

    if (loadState === 'denied') return <AccessDeniedScreen />;

    const currentWorkspace = workspace;
    const currentOptions = options;
    const isDetail = route.kind === 'project' || route.kind === 'task';
    const title = route.kind === 'inbox' ? 'صندوق کار من' : route.kind === 'projects' ? 'پروژه‌ها' : route.kind === 'task' ? 'جزئیات وظیفه' : 'جزئیات پروژه';
    const resource = route.kind === 'inbox' ? 'work-inbox' : 'projects';
    const subtitle = route.kind === 'inbox' ? 'وظیفه‌های محول‌شده در سازمان فعال' : 'پروژه‌ها، وظیفه‌ها و هزینه‌های خرید';
    const toolbar: ReactNode = route.kind === 'projects' ? (
        <form className="work-search" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSearch(query.trim()); }} role="search">
            <label htmlFor="p12-project-search">جست‌وجوی پروژه یا وظیفه</label><input id="p12-project-search" type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
            <WorkButton type="submit">جست‌وجو</WorkButton>
        </form>
    ) : <div className="work-toolbar-note"><span>مدیریت پروژه و کار</span><bdi dir="ltr">P12</bdi></div>;

    if (!currentWorkspace) {
        return <main className="work-loading" data-lg-role="stage"><p>{loadState === 'error' ? error : 'در حال اتصال به فضای کار…'}</p></main>;
    }

    return (
        <WorkspaceShell
            title={title}
            eyebrow="مدیریت کار · P12"
            subtitle={subtitle}
            activePage={isDetail ? 'detail' : 'list'}
            connectionState={loadState === 'loading' ? 'loading' : loadState === 'error' ? 'error' : 'ready'}
            connectionLabel={loadState === 'error' ? 'خطای اتصال' : loadState === 'loading' ? 'در حال بارگذاری' : 'محلی · آماده'}
            detailHref={route.kind === 'project' ? `/projects/${route.projectId}` : route.kind === 'task' ? routeHref(route.projectId, route.taskId) : undefined}
            detailLabel={route.kind === 'task' ? 'وظیفه' : 'جزئیات پروژه'}
            toolbar={toolbar}
            forceFallback={forceFallback}
            activeOrganization={currentWorkspace.active_organization}
            organizations={currentWorkspace.organizations}
            onOrganizationChange={(id) => void handleOrganizationChange(id)}
            onSignOut={() => void handleSignOut()}
            organizationSwitching={switchingOrganization}
            activeResource={resource}
            phaseLabel="P12"
        >
            {error && <div className="work-error-banner" role="alert" data-testid="p12-error">{error}</div>}
            {loadState === 'loading' && <section className="work-surface work-loading-surface" data-lg-role="focus"><p>در حال بارگذاری داده‌های سازمان فعال…</p></section>}
            {loadState === 'error' && <section className="work-surface work-loading-surface" data-lg-role="focus"><p>{error}</p><WorkButton onClick={() => setRevision((current) => current + 1)}>تلاش دوباره</WorkButton></section>}
            {loadState === 'ready' && route.kind === 'projects' && <ProjectList projects={projects} canManage={currentOptions?.can_manage ?? false} busy={busy} onCreate={handleProjectCreate} />}
            {loadState === 'ready' && route.kind === 'project' && project && currentOptions && <ProjectDetail project={project} options={currentOptions} canManage={currentOptions.can_manage} busy={busy} view={view} onViewChange={setView} onCreateTask={(input, form) => handleTaskCreate(input, form)} onComment={handleProjectComment} onLinkCost={handleCostLink} />}
            {loadState === 'ready' && route.kind === 'task' && taskDetail && currentOptions && <TaskDetail detail={taskDetail} options={currentOptions} canManage={currentOptions.can_manage} busy={busy} onTransition={handleTaskTransition} onUpdate={handleTaskUpdate} onComment={handleTaskComment} />}
            {loadState === 'ready' && route.kind === 'inbox' && inbox && <Inbox inbox={inbox} />}
        </WorkspaceShell>
    );
}
