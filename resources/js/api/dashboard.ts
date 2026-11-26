export type DisplayCurrency = 'IRR' | 'TOMAN';
export type DashboardMetricSlug = 'net-sales' | 'overdue-receivables' | 'available-stock' | 'pending-purchase-approvals';

export interface DashboardBook {
    id: number;
    code: string;
    name: string;
    currency_code: string;
    currency_scale: number;
    time_zone: string;
}

export interface DashboardOptions {
    books: DashboardBook[];
    default_book_id: number | null;
    default_as_of_date: string | null;
    display_currencies: Array<{ code: DisplayCurrency; label: string }>;
}

export interface FinancialMetric {
    total_rial: string;
    display_amount: string;
    currency: DisplayCurrency;
    record_count: number;
}

export interface StockUnitTotal {
    unit: { id: number; code: string; name: string; symbol: string | null };
    quantity_milli: string;
    quantity: string;
    product_location_count: number;
}

export interface DashboardSummary {
    organization_id: number;
    book: DashboardBook;
    as_of_date: string;
    cutoff_local: string;
    display_currency: DisplayCurrency;
    metrics: {
        net_sales: FinancialMetric;
        overdue_receivables: FinancialMetric;
        available_stock: { unit_totals: StockUnitTotal[]; record_count: number; scope: 'organization' };
        pending_purchase_approvals: { count: number; record_count: number; scope: 'organization' };
    };
}

export interface DashboardRecordPage {
    metric: DashboardMetricSlug;
    records: Array<Record<string, unknown>>;
    pagination: {
        current_page: number;
        per_page: number;
        total_records: number;
        last_page: number;
        previous_page: number | null;
        next_page: number | null;
    };
    reconciliation: Record<string, unknown>;
}

export class DashboardApiError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
        this.name = 'DashboardApiError';
    }
}

interface ApiEnvelope<T> {
    data: T;
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(path, {
        credentials: 'same-origin',
        signal,
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    });
    const payload = await response.json().catch(() => null) as ({ message?: string; errors?: Record<string, string[]> } & Partial<ApiEnvelope<T>>) | null;

    if (!response.ok) {
        const validation = payload?.errors ? Object.values(payload.errors).flat()[0] : null;
        throw new DashboardApiError(response.status, validation ?? payload?.message ?? `درخواست با کد ${response.status} انجام نشد.`);
    }

    if (payload === null || !('data' in payload)) {
        throw new DashboardApiError(response.status, 'پاسخ سرور قالب مورد انتظار را ندارد.');
    }

    return payload.data as T;
}

function queryString(filters: { bookId: number; asOfDate: string; currency: DisplayCurrency; page?: number }): string {
    const params = new URLSearchParams({
        book_id: String(filters.bookId),
        as_of_date: filters.asOfDate,
        currency: filters.currency,
    });
    if (filters.page && filters.page > 1) params.set('page', String(filters.page));

    return params.toString();
}

export function fetchDashboardOptions(signal?: AbortSignal): Promise<DashboardOptions> {
    return request<DashboardOptions>('/api/v1/dashboard/options', signal);
}

export function fetchDashboardSummary(
    filters: { bookId: number; asOfDate: string; currency: DisplayCurrency },
    signal?: AbortSignal,
): Promise<DashboardSummary> {
    return request<DashboardSummary>(`/api/v1/dashboard?${queryString(filters)}`, signal);
}

export function fetchDashboardRecords(
    metric: DashboardMetricSlug,
    filters: { bookId: number; asOfDate: string; currency: DisplayCurrency; page: number },
    signal?: AbortSignal,
): Promise<DashboardRecordPage> {
    return request<DashboardRecordPage>(`/api/v1/dashboard/metrics/${metric}?${queryString(filters)}`, signal);
}
