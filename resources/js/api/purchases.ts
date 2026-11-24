export interface PurchaseUnit {
    id: number;
    code: string;
    name: string;
    symbol: string;
}

export interface PurchaseProduct {
    id: number;
    code: string;
    name: string;
    base_unit: PurchaseUnit;
}

export interface PurchaseParty {
    id: number;
    code: string;
    name: string;
}

export interface PurchaseLocation {
    id: number;
    code: string;
    name: string;
}

export interface PurchaseWarehouse {
    id: number;
    code: string;
    name: string;
    locations: PurchaseLocation[];
}

export interface PurchasesOptions {
    suppliers: PurchaseParty[];
    products: PurchaseProduct[];
    warehouses: PurchaseWarehouse[];
    current_user_id: number;
    can_manage: boolean;
}

export interface PurchaseRequestLine {
    id: number;
    product_id: number;
    product_code: string;
    product_name: string;
    unit: PurchaseUnit;
    quantity: string;
}

export interface PurchaseRequestRecord {
    id: number;
    code: string;
    title: string;
    status: 'draft' | 'submitted' | 'approved';
    requester: { id: number; name: string | null };
    submitted_by: string | null;
    submitted_at: string | null;
    approved_by: string | null;
    approved_at: string | null;
    created_at: string | null;
    purchase_order: { id: number; code: string } | null;
    lines: PurchaseRequestLine[];
}

export interface PurchaseReceipt {
    id: number;
    quantity: string;
    created_at: string | null;
    actor: string | null;
    warehouse: PurchaseParty;
    location: PurchaseLocation;
    operation: { id: number; reference: string; operation_type: string } | null;
    movement: { id: number; direction: 'inbound' | 'outbound'; quantity: string } | null;
}

export interface PurchaseOrderLine {
    id: number;
    source_request_line_id: number;
    product_id: number;
    product_code: string;
    product_name: string;
    unit: PurchaseUnit;
    ordered_quantity: string;
    received_quantity: string;
    remaining_quantity: string;
    unit_price_rial: string;
    line_total_rial: string;
    receipts: PurchaseReceipt[];
}

export interface PurchaseOrderRecord {
    id: number;
    code: string;
    status: 'open' | 'closed';
    source_request: { id: number; code: string | null; title: string | null };
    supplier: PurchaseParty;
    currency: { code: string; scale: number; label: string };
    rounding_rule: string;
    total_rial: string;
    ordered_at: string | null;
    closed_at: string | null;
    created_by: string | null;
    lines: PurchaseOrderLine[];
}

export interface PurchaseApiErrorShape {
    message?: unknown;
    errors?: unknown;
}

export class PurchaseApiError extends Error {
    constructor(readonly status: number, message: string, readonly errors: Record<string, string[]> = {}) {
        super(message);
        this.name = 'PurchaseApiError';
    }
}

function csrfToken(): string {
    return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(path, {
        credentials: 'same-origin',
        ...init,
        headers: { Accept: 'application/json', ...init.headers },
    });
    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        payload = null;
    }

    if (!response.ok) {
        const body = typeof payload === 'object' && payload !== null ? payload as PurchaseApiErrorShape : {};
        const errors = typeof body.errors === 'object' && body.errors !== null ? body.errors as Record<string, string[]> : {};
        const firstError = Object.values(errors).flat().find((item) => typeof item === 'string');
        const message = typeof firstError === 'string' ? firstError : typeof body.message === 'string' ? body.message : `درخواست ناموفق بود (${response.status}).`;
        throw new PurchaseApiError(response.status, message, errors);
    }

    return payload as T;
}

function post<T>(path: string, input: unknown, idempotencyKey?: string): Promise<T> {
    return request(path, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': csrfToken(),
            ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: input === undefined ? undefined : JSON.stringify(input),
    });
}

export async function fetchPurchasesOptions(signal?: AbortSignal): Promise<PurchasesOptions> {
    const payload = await request<{ data: Omit<PurchasesOptions, 'current_user_id' | 'can_manage'>; current_user_id: number; can_manage: boolean }>(
        '/api/v1/purchases/options', { signal },
    );
    return { ...payload.data, current_user_id: payload.current_user_id, can_manage: payload.can_manage };
}

export async function fetchPurchaseRequests(signal?: AbortSignal): Promise<PurchaseRequestRecord[]> {
    return (await request<{ data: PurchaseRequestRecord[] }>('/api/v1/purchase-requests', { signal })).data;
}

export async function fetchPurchaseRequest(id: number, signal?: AbortSignal): Promise<PurchaseRequestRecord> {
    return (await request<{ data: PurchaseRequestRecord }>(`/api/v1/purchase-requests/${id}`, { signal })).data;
}

export async function createPurchaseRequest(input: { title: string; lines: { product_id: number; quantity: string }[] }): Promise<PurchaseRequestRecord> {
    return (await post<{ data: PurchaseRequestRecord }>('/api/v1/purchase-requests', input)).data;
}

export async function submitPurchaseRequest(id: number): Promise<PurchaseRequestRecord> {
    return (await post<{ data: PurchaseRequestRecord }>(`/api/v1/purchase-requests/${id}/submit`, {})).data;
}

export async function approvePurchaseRequest(id: number): Promise<PurchaseRequestRecord> {
    return (await post<{ data: PurchaseRequestRecord }>(`/api/v1/purchase-requests/${id}/approve`, {})).data;
}

export async function convertPurchaseRequest(
    id: number,
    input: { supplier_party_id: number; lines: { source_request_line_id: number; unit_price_rial: string }[] },
): Promise<{ order: PurchaseOrderRecord; already_exists: boolean }> {
    const result = await post<{ data: PurchaseOrderRecord; already_exists: boolean }>(`/api/v1/purchase-requests/${id}/convert`, input);
    return { order: result.data, already_exists: result.already_exists };
}

export async function fetchPurchaseOrders(signal?: AbortSignal): Promise<PurchaseOrderRecord[]> {
    return (await request<{ data: PurchaseOrderRecord[] }>('/api/v1/purchase-orders', { signal })).data;
}

export async function fetchPurchaseOrder(id: number, signal?: AbortSignal): Promise<PurchaseOrderRecord> {
    return (await request<{ data: PurchaseOrderRecord }>(`/api/v1/purchase-orders/${id}`, { signal })).data;
}

export async function receivePurchaseOrderLine(
    orderId: number,
    lineId: number,
    input: { warehouse_id: number; location_id: number; quantity: string },
    idempotencyKey: string,
): Promise<{ order: PurchaseOrderRecord; already_exists: boolean }> {
    const result = await post<{ data: PurchaseOrderRecord; already_exists: boolean }>(
        `/api/v1/purchase-orders/${orderId}/lines/${lineId}/receipts`, input, idempotencyKey,
    );
    return { order: result.data, already_exists: result.already_exists };
}
