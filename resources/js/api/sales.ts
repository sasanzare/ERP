import type { OrganizationMembership, WorkspaceContext } from './products';

export interface SalesCustomer {
    id: number;
    code: string;
    name: string;
}

export interface SalesProduct {
    id: number;
    code: string;
    name: string;
    base_unit: { id: number; code: string; name: string; symbol: string } | null;
}

export interface SalesPriceList {
    id: number;
    code: string;
    name: string;
}

export interface SalesOptions {
    customers: SalesCustomer[];
    products: SalesProduct[];
    price_lists: SalesPriceList[];
}

export interface SalesWorkspaceContext extends WorkspaceContext {
    active_organization: OrganizationMembership;
    capabilities: WorkspaceContext['capabilities'] & { sales: { manage: boolean } };
}

export interface LeadSummary {
    id: number;
    code: string;
    title: string;
    customer: SalesCustomer;
}

export interface LeadActivity {
    id: number;
    lead_id: number;
    lead: Pick<LeadSummary, 'id' | 'code' | 'title'> | null;
    title: string;
    due_at: string;
    completed_at: string | null;
    is_overdue: boolean;
}

export interface LeadDetail extends LeadSummary {
    activities: LeadActivity[];
    quotes: QuoteSummary[];
}

export interface QuoteSummary {
    id: number;
    code: string;
    status: 'draft' | 'confirmed';
    total_toman: string;
    created_at: string;
    order: { id: number; code: string } | null;
    lead?: Pick<LeadSummary, 'id' | 'code' | 'title'>;
    customer?: SalesCustomer;
}

export interface QuoteLine {
    id: number;
    product_id: number;
    unit_id: number;
    product_code: string;
    product_name: string;
    unit: { id: number; code: string; name: string; symbol: string };
    quantity: string;
    unit_price_toman: string;
    discount_basis_points: number;
    discount_percent: string;
    line_net_toman: string;
    source_quote_line_id?: number;
}

export interface SalesQuote extends QuoteSummary {
    lead: Pick<LeadSummary, 'id' | 'code' | 'title'>;
    customer: SalesCustomer;
    price_list: SalesPriceList;
    confirmed_at: string | null;
    lines: QuoteLine[];
}

export interface SalesOrder {
    id: number;
    code: string;
    status: 'confirmed';
    total_toman: string;
    confirmed_at: string;
    source_quote: { id: number; code: string | null };
    lead: Pick<LeadSummary, 'id' | 'code' | 'title'>;
    customer: SalesCustomer;
    price_list: Pick<SalesPriceList, 'code' | 'name'>;
    lines: QuoteLine[];
}

export class SalesApiError extends Error {
    readonly status: number;
    readonly errors: Record<string, string[]>;

    constructor(status: number, message: string, errors: Record<string, string[]> = {}) {
        super(message);
        this.name = 'SalesApiError';
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
        const message = typeof firstError === 'string' ? firstError : typeof body.message === 'string' ? body.message : `درخواست ناموفق بود (${response.status}).`;
        throw new SalesApiError(response.status, message, errors);
    }

    return payload as T;
}

function mutation(method: string, body?: unknown): RequestInit {
    return {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': csrfToken(),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
}

function queryPath(path: string, query: string): string {
    const value = query.trim();
    return value ? `${path}?q=${encodeURIComponent(value)}` : path;
}

export async function fetchSalesOptions(signal?: AbortSignal): Promise<SalesOptions> {
    return (await request<{ data: SalesOptions }>('/api/v1/sales/options', { signal })).data;
}

export async function fetchLeads(query = '', signal?: AbortSignal): Promise<LeadSummary[]> {
    return (await request<{ data: LeadSummary[] }>(queryPath('/api/v1/leads', query), { signal })).data;
}

export async function fetchLead(id: number, signal?: AbortSignal): Promise<LeadDetail> {
    return (await request<{ data: LeadDetail }>(`/api/v1/leads/${id}`, { signal })).data;
}

export async function fetchOverdueActivities(signal?: AbortSignal): Promise<LeadActivity[]> {
    return (await request<{ data: LeadActivity[] }>('/api/v1/lead-activities/overdue', { signal })).data;
}

export async function fetchActivity(id: number, signal?: AbortSignal): Promise<LeadActivity> {
    return (await request<{ data: LeadActivity }>(`/api/v1/lead-activities/${id}`, { signal })).data;
}

export async function fetchQuotes(query = '', signal?: AbortSignal): Promise<QuoteSummary[]> {
    return (await request<{ data: QuoteSummary[] }>(queryPath('/api/v1/quotes', query), { signal })).data;
}

export async function fetchQuote(id: number, signal?: AbortSignal): Promise<SalesQuote> {
    return (await request<{ data: SalesQuote }>(`/api/v1/quotes/${id}`, { signal })).data;
}

export async function fetchOrders(query = '', signal?: AbortSignal): Promise<SalesOrder[]> {
    return (await request<{ data: SalesOrder[] }>(queryPath('/api/v1/sales-orders', query), { signal })).data;
}

export async function fetchOrder(id: number, signal?: AbortSignal): Promise<SalesOrder> {
    return (await request<{ data: SalesOrder }>(`/api/v1/sales-orders/${id}`, { signal })).data;
}

export async function createLead(values: { title: string; party_id: number }): Promise<LeadSummary> {
    return (await request<{ data: LeadSummary }>('/api/v1/leads', mutation('POST', values))).data;
}

export async function createActivity(leadId: number, values: { title: string; due_at: string }): Promise<LeadActivity> {
    return (await request<{ data: LeadActivity }>(`/api/v1/leads/${leadId}/activities`, mutation('POST', values))).data;
}

export async function completeActivity(id: number): Promise<LeadActivity> {
    return (await request<{ data: LeadActivity }>(`/api/v1/lead-activities/${id}/complete`, mutation('POST'))).data;
}

export async function createQuote(leadId: number, priceListId: number): Promise<SalesQuote> {
    return (await request<{ data: SalesQuote }>(`/api/v1/leads/${leadId}/quotes`, mutation('POST', { price_list_id: priceListId }))).data;
}

export async function addQuoteLine(quoteId: number, values: { product_id: number; quantity: string; discount: string }): Promise<QuoteLine> {
    return (await request<{ data: QuoteLine }>(`/api/v1/quotes/${quoteId}/lines`, mutation('POST', values))).data;
}

export async function updateQuoteLine(quoteId: number, lineId: number, values: { quantity: string; discount: string }): Promise<QuoteLine> {
    return (await request<{ data: QuoteLine }>(`/api/v1/quotes/${quoteId}/lines/${lineId}`, mutation('PATCH', values))).data;
}

export async function repriceQuoteLine(quoteId: number, lineId: number): Promise<QuoteLine> {
    return (await request<{ data: QuoteLine }>(`/api/v1/quotes/${quoteId}/lines/${lineId}/reprice`, mutation('POST'))).data;
}

export async function removeQuoteLine(quoteId: number, lineId: number): Promise<void> {
    await request<{ data: { removed: boolean } }>(`/api/v1/quotes/${quoteId}/lines/${lineId}`, mutation('DELETE'));
}

export async function confirmQuote(quoteId: number): Promise<SalesQuote> {
    return (await request<{ data: SalesQuote }>(`/api/v1/quotes/${quoteId}/confirm`, mutation('POST'))).data;
}

export async function convertQuote(quoteId: number): Promise<{ order: SalesOrder; alreadyExists: boolean }> {
    const payload = await request<{ data: SalesOrder; already_exists: boolean }>(`/api/v1/quotes/${quoteId}/convert`, mutation('POST'));
    return { order: payload.data, alreadyExists: payload.already_exists };
}
