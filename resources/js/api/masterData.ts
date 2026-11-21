export type MasterDataResource = 'parties' | 'units' | 'warehouses' | 'locations' | 'price-lists';
export type PartyRole = 'customer' | 'supplier';

export interface PartyRecord {
    id: number;
    code: string;
    display_name: string;
    roles: PartyRole[];
}

export interface UnitRecord {
    id: number;
    code: string;
    name: string;
    symbol: string;
    is_active: boolean;
}

export type UnitSummary = Pick<UnitRecord, 'id' | 'code' | 'name' | 'symbol'>;

export interface ProductDetailRecord {
    id: number;
    code: string;
    name: string;
    base_unit: UnitSummary | null;
}

export interface WarehouseRecord {
    id: number;
    code: string;
    name: string;
}

export interface LocationRecord {
    id: number;
    code: string;
    name: string;
    warehouse: WarehouseRecord | null;
}

export interface PriceListEntryRecord {
    product: ProductDetailRecord;
    amount_rial: string;
}

export interface PriceListRecord {
    id: number;
    code: string;
    name: string;
    currency?: 'IRR';
    entry_count?: number;
    entries?: PriceListEntryRecord[];
}

export type MasterDataRecord = PartyRecord | UnitRecord | WarehouseRecord | LocationRecord | PriceListRecord;

export interface PriceResolution {
    price_list: Pick<PriceListRecord, 'id' | 'code' | 'name'>;
    product: Pick<ProductDetailRecord, 'id' | 'code' | 'name'>;
    priced: boolean;
    amount_rial: string | null;
    unit: UnitSummary | null;
}

export class ApiError extends Error {
    readonly status: number;
    readonly errors: Record<string, string[]>;

    constructor(status: number, message: string, errors: Record<string, string[]> = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.errors = errors;
    }
}

function csrfToken(): string {
    return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json', ...(init.headers ?? {}) },
        ...init,
    });
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
        const body = typeof payload === 'object' && payload !== null ? payload as { message?: unknown; errors?: unknown } : {};
        const errors = typeof body.errors === 'object' && body.errors !== null ? body.errors as Record<string, string[]> : {};
        const firstError = Object.values(errors).flat().find((item) => typeof item === 'string');
        throw new ApiError(response.status, typeof body.message === 'string' ? firstError ?? body.message : `درخواست ناموفق بود (${response.status}).`, errors);
    }

    return payload as T;
}

function mutationHeaders(): HeadersInit {
    return {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken(),
    };
}

export async function fetchMasterData<T extends MasterDataRecord>(resource: MasterDataResource, query = '', signal?: AbortSignal): Promise<T[]> {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    const suffix = params.size ? `?${params.toString()}` : '';
    const payload = await request<{ data: T[] }>(`/api/v1/${resource}${suffix}`, { signal });
    if (!Array.isArray(payload.data)) throw new Error('ساختار پاسخ فهرست معتبر نیست.');
    return payload.data;
}

export async function fetchResourceRecord<T extends MasterDataRecord>(resource: MasterDataResource, id: number, signal?: AbortSignal): Promise<T> {
    const payload = await request<{ data: T }>(`/api/v1/${resource}/${id}`, { signal });
    if (!payload.data || typeof payload.data !== 'object') throw new Error('ساختار پاسخ جزئیات معتبر نیست.');
    return payload.data;
}

export async function createResourceRecord<T extends MasterDataRecord>(resource: MasterDataResource, values: Record<string, unknown>): Promise<T> {
    const payload = await request<{ data: T }>(`/api/v1/${resource}`, {
        method: 'POST',
        headers: mutationHeaders(),
        body: JSON.stringify(values),
    });
    return payload.data;
}

export async function updateResourceRecord<T extends MasterDataRecord>(resource: MasterDataResource, id: number, values: Record<string, unknown>): Promise<T> {
    const payload = await request<{ data: T }>(`/api/v1/${resource}/${id}`, {
        method: 'PATCH',
        headers: mutationHeaders(),
        body: JSON.stringify(values),
    });
    return payload.data;
}

export async function fetchUnits(signal?: AbortSignal): Promise<UnitRecord[]> {
    const payload = await request<{ data: UnitRecord[] }>('/api/v1/units', { signal });
    return payload.data;
}

export async function fetchWarehouseLocations(warehouseId: number, signal?: AbortSignal): Promise<LocationRecord[]> {
    const params = new URLSearchParams({ warehouse_id: String(warehouseId) });
    const payload = await request<{ data: LocationRecord[] }>(`/api/v1/locations?${params}`, { signal });
    return payload.data;
}

export async function fetchProductDetail(id: number, signal?: AbortSignal): Promise<ProductDetailRecord> {
    const payload = await request<{ data: ProductDetailRecord }>(`/api/v1/products/${id}`, { signal });
    return payload.data;
}

export async function createProduct(values: { code: string; name: string; base_unit_id: number | null }): Promise<ProductDetailRecord> {
    const payload = await request<{ data: ProductDetailRecord }>('/api/v1/products', {
        method: 'POST',
        headers: mutationHeaders(),
        body: JSON.stringify(values),
    });
    return payload.data;
}

export async function updateProduct(id: number, values: { code?: string; name?: string; base_unit_id?: number | null }): Promise<void> {
    await request<{ data: unknown }>(`/api/v1/products/${id}`, {
        method: 'PATCH',
        headers: mutationHeaders(),
        body: JSON.stringify(values),
    });
}

export async function resolveListPrice(priceListId: number, productId: number, signal?: AbortSignal): Promise<PriceResolution> {
    const payload = await request<{ data: PriceResolution }>(`/api/v1/price-lists/${priceListId}/products/${productId}`, { signal });
    return payload.data;
}

export async function saveListPrice(priceListId: number, productId: number, amountRial: string): Promise<void> {
    await request<{ data: unknown }>(`/api/v1/price-lists/${priceListId}/entries`, {
        method: 'POST',
        headers: mutationHeaders(),
        body: JSON.stringify({ product_id: productId, amount_rial: amountRial }),
    });
}

export async function validateLocationSelection(warehouseId: number, locationId: number): Promise<void> {
    await request<{ data: unknown }>('/api/v1/locations/validate-selection', {
        method: 'POST',
        headers: mutationHeaders(),
        body: JSON.stringify({ warehouse_id: warehouseId, location_id: locationId }),
    });
}
