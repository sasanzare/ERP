export interface StockUnit {
    id: number;
    code: string;
    name: string;
    symbol: string;
}

export interface StockProduct {
    id: number;
    code: string;
    name: string;
    base_unit: StockUnit | null;
}

export interface StockLocation {
    id: number;
    code: string;
    name: string;
}

export interface StockWarehouse {
    id: number;
    code: string;
    name: string;
    locations: StockLocation[];
}

export interface StockOptions {
    products: StockProduct[];
    warehouses: StockWarehouse[];
}

export interface StockBalance {
    product: Pick<StockProduct, 'id' | 'code' | 'name'>;
    base_unit: StockUnit;
    location: StockLocation & { warehouse: Pick<StockWarehouse, 'id' | 'code' | 'name'> };
    physical_quantity: string;
    reserved_quantity: string;
    available_quantity: string;
}

export interface StockOperation {
    id: number;
    reference: string;
    operation_type: 'opening' | 'receipt' | 'issue' | 'transfer';
    quantity: string;
    product: Pick<StockProduct, 'id' | 'code' | 'name'>;
    base_unit: StockUnit;
    from_location: StockLocation | null;
    to_location: StockLocation | null;
    legs: { id: number; location_id: number; direction: 'inbound' | 'outbound'; quantity: string }[];
    actor: { id: number | null; name: string | null };
    created_at: string;
}

export interface StockReservation {
    id: number;
    product: Pick<StockProduct, 'id' | 'code' | 'name'>;
    base_unit: StockUnit;
    location: StockLocation;
    quantity: string;
    status: 'open' | 'released';
    created_by: { id: number | null; name: string | null };
    created_at: string;
    released_by: { id: number; name: string | null } | null;
    released_at: string | null;
}

export type StockOperationType = StockOperation['operation_type'];

export interface StockOperationInput {
    operation_type: StockOperationType;
    product_id: number;
    quantity: string;
    warehouse_id: number;
    location_id: number;
    destination_warehouse_id?: number;
    destination_location_id?: number;
}

export interface StockReservationInput {
    product_id: number;
    quantity: string;
    warehouse_id: number;
    location_id: number;
}

export class StockApiError extends Error {
    constructor(readonly status: number, message: string, readonly errors: Record<string, string[]> = {}) {
        super(message);
        this.name = 'StockApiError';
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
        const body = typeof payload === 'object' && payload !== null ? payload as { message?: unknown; errors?: unknown } : {};
        const errors = typeof body.errors === 'object' && body.errors !== null ? body.errors as Record<string, string[]> : {};
        const firstError = Object.values(errors).flat().find((item) => typeof item === 'string');
        const message = typeof firstError === 'string' ? firstError : typeof body.message === 'string' ? body.message : `درخواست ناموفق بود (${response.status}).`;
        throw new StockApiError(response.status, message, errors);
    }

    return payload as T;
}

function query<T>(path: string, signal?: AbortSignal): Promise<{ data: T }> {
    return request(path, { signal });
}

function mutation<T>(path: string, input: unknown, idempotencyKey?: string): Promise<{ data: T; already_exists?: boolean }> {
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

export async function fetchStockOptions(signal?: AbortSignal): Promise<StockOptions> {
    return (await query<StockOptions>('/api/v1/stock/options', signal)).data;
}

export async function fetchStockBalances(signal?: AbortSignal): Promise<StockBalance[]> {
    return (await query<StockBalance[]>('/api/v1/stock/balances', signal)).data;
}

export async function fetchStockMovements(signal?: AbortSignal): Promise<StockOperation[]> {
    return (await query<StockOperation[]>('/api/v1/stock/movements', signal)).data;
}

export async function fetchStockReservations(signal?: AbortSignal): Promise<StockReservation[]> {
    return (await query<StockReservation[]>('/api/v1/stock/reservations', signal)).data;
}

export async function postStockOperation(input: StockOperationInput, idempotencyKey: string): Promise<StockOperation> {
    return (await mutation<StockOperation>('/api/v1/stock/operations', input, idempotencyKey)).data;
}

export async function createStockReservation(input: StockReservationInput, idempotencyKey: string): Promise<StockReservation> {
    return (await mutation<StockReservation>('/api/v1/stock/reservations', input, idempotencyKey)).data;
}

export async function releaseStockReservation(id: number): Promise<StockReservation> {
    return (await mutation<StockReservation>(`/api/v1/stock/reservations/${id}/release`, undefined)).data;
}
