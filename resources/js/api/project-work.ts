export type WorkTaskStatus = 'open' | 'in_progress' | 'completed';

export interface WorkPerson {
    id: number;
    name: string;
}

export interface WorkMember extends WorkPerson {
    role: 'reader' | 'editor';
}

export interface WorkTask {
    id: number;
    project_id: number;
    project: { id: number; title: string } | null;
    title: string;
    status: WorkTaskStatus;
    due_on: string | null;
    is_overdue: boolean;
    assignee: WorkPerson | null;
    completed_by: WorkPerson | null;
    completed_at: string | null;
    created_at: string | null;
    due_reminder?: { identity: string; due_on: string; delivered_at: string } | null;
}

export interface WorkComment {
    id: number;
    body: string;
    author: WorkPerson;
    created_at: string | null;
}

export interface ProjectPurchaseCost {
    id: number;
    purchase_order_id: number;
    purchase_order_line_id: number;
    purchase_order_code: string;
    supplier_name: string;
    product_code: string;
    product_name: string;
    unit_name: string;
    unit_symbol: string;
    amount_rial: string;
    source_url: string;
}

export interface ProjectTaskCounts {
    open: number;
    in_progress: number;
    completed: number;
    open_total: number;
}

export interface WorkProjectSummary {
    id: number;
    title: string;
    description: string | null;
    created_at: string | null;
    task_counts: ProjectTaskCounts;
    overdue_count: number;
    committed_purchase_rial: string;
}

export interface WorkProject extends WorkProjectSummary {
    today: string;
    time_zone: string;
    open_task_count: number;
    tasks: WorkTask[];
    comments: WorkComment[];
    purchase_costs: ProjectPurchaseCost[];
}

export interface WorkTaskDetail {
    task: WorkTask;
    comments: WorkComment[];
    today: string;
    time_zone: string;
}

export interface WorkOptions {
    members: WorkMember[];
    eligible_purchase_lines: Array<{
        id: number;
        purchase_order_id: number;
        purchase_order_code: string;
        supplier_name: string;
        product_code: string;
        product_name: string;
        unit_symbol: string;
        amount_rial: string;
    }>;
    time_zone: string;
    today: string;
    current_user_id: number;
    can_manage: boolean;
}

export interface WorkInbox {
    data: WorkTask[];
    open_count: number;
    due_reminder_count: number;
    today: string;
    time_zone: string;
}

export class WorkApiError extends Error {
    constructor(
        readonly status: number,
        message: string,
        readonly errors: Record<string, string[]> = {},
    ) {
        super(message);
        this.name = 'WorkApiError';
    }
}

function csrfToken(): string {
    return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');

    const response = await fetch(path, {
        ...init,
        credentials: 'same-origin',
        headers,
    });
    const payload = await response.json().catch(() => ({})) as {
        message?: string;
        errors?: Record<string, string[]>;
    };

    if (!response.ok) {
        const firstError = Object.values(payload.errors ?? {}).flat().find((item) => typeof item === 'string');
        throw new WorkApiError(
            response.status,
            firstError ?? payload.message ?? `درخواست ناموفق بود (${response.status}).`,
            payload.errors ?? {},
        );
    }

    return payload as T;
}

function post<T>(path: string, input: unknown): Promise<T> {
    return request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrfToken() },
        body: JSON.stringify(input),
    });
}

function patch<T>(path: string, input: unknown): Promise<T> {
    return request(path, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrfToken() },
        body: JSON.stringify(input),
    });
}

export async function fetchWorkOptions(signal?: AbortSignal): Promise<WorkOptions> {
    const payload = await request<{
        data: Omit<WorkOptions, 'current_user_id' | 'can_manage'>;
        current_user_id: number;
        can_manage: boolean;
    }>('/api/v1/projects/options', { signal });

    return { ...payload.data, current_user_id: payload.current_user_id, can_manage: payload.can_manage };
}

export async function fetchWorkProjects(search: string, signal?: AbortSignal): Promise<WorkProjectSummary[]> {
    const query = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : '';
    return (await request<{ data: WorkProjectSummary[] }>(`/api/v1/projects${query}`, { signal })).data;
}

export async function fetchWorkProject(id: number, signal?: AbortSignal): Promise<WorkProject> {
    return (await request<{ data: WorkProject }>(`/api/v1/projects/${id}`, { signal })).data;
}

export async function createWorkProject(input: { title: string; description: string }): Promise<WorkProject> {
    return (await post<{ data: WorkProject }>('/api/v1/projects', input)).data;
}

export async function createWorkTask(
    projectId: number,
    input: { title: string; due_on: string | null; assignee_user_id: number | null },
): Promise<WorkTask> {
    return (await post<{ data: WorkTask }>(`/api/v1/projects/${projectId}/tasks`, input)).data;
}

export async function fetchWorkTask(projectId: number, taskId: number, signal?: AbortSignal): Promise<WorkTaskDetail> {
    return (await request<{ data: WorkTaskDetail }>(`/api/v1/projects/${projectId}/tasks/${taskId}`, { signal })).data;
}

export async function updateWorkTask(
    projectId: number,
    taskId: number,
    input: { title?: string; due_on?: string | null; assignee_user_id?: number | null },
): Promise<WorkTask> {
    return (await patch<{ data: WorkTask }>(`/api/v1/projects/${projectId}/tasks/${taskId}`, input)).data;
}

export async function transitionWorkTask(
    projectId: number,
    taskId: number,
    status: WorkTaskStatus,
): Promise<{ task: WorkTask; already_in_status: boolean }> {
    const payload = await post<{ data: WorkTask; already_in_status: boolean }>(
        `/api/v1/projects/${projectId}/tasks/${taskId}/transition`, { status },
    );
    return { task: payload.data, already_in_status: payload.already_in_status };
}

export async function addProjectComment(projectId: number, body: string): Promise<WorkComment> {
    return (await post<{ data: WorkComment }>(`/api/v1/projects/${projectId}/comments`, { body })).data;
}

export async function addTaskComment(projectId: number, taskId: number, body: string): Promise<WorkComment> {
    return (await post<{ data: WorkComment }>(`/api/v1/projects/${projectId}/tasks/${taskId}/comments`, { body })).data;
}

export async function linkPurchaseOrderLine(
    projectId: number,
    purchaseOrderLineId: number,
): Promise<{ cost: ProjectPurchaseCost; already_linked: boolean }> {
    const payload = await post<{ data: ProjectPurchaseCost; already_linked: boolean }>(
        `/api/v1/projects/${projectId}/purchase-costs`, { purchase_order_line_id: purchaseOrderLineId },
    );
    return { cost: payload.data, already_linked: payload.already_linked };
}

export async function processDueWorkReminders(): Promise<{ created: number; today: string; time_zone: string }> {
    return post('/api/v1/work/inbox/process-due-reminders', {});
}

export async function fetchWorkInbox(signal?: AbortSignal): Promise<WorkInbox> {
    return request('/api/v1/work/inbox', { signal });
}
