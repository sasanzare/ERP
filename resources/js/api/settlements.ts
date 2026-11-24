export type SettlementDirection = 'customer' | 'supplier';

export interface SettlementBook {
    id: number;
    code: string;
    name: string;
    currency_code: string;
    currency_scale: number;
    posting_ready: boolean;
    posting_blocker: string | null;
    posting_mode: 'synthetic_test' | 'approved' | null;
}

export interface SettlementSourceEvent {
    id: number;
    quantity_milli: string;
    already_invoiced_milli: string;
    available_milli: string;
    available_quantity: string;
    created_at: string | null;
    operation_id?: number;
    movement_id?: number;
    inventory_operation_id?: number;
    inventory_movement_id?: number;
}

export interface SettlementSourceLine {
    id: number;
    item_code: string;
    item_name: string;
    unit_name: string;
    ordered_quantity?: string;
    line_net_toman?: string;
    ordered_quantity_milli?: string;
    received_quantity_milli?: string;
    unit_price_rial?: string;
    line_total_rial?: string;
    deliveries?: SettlementSourceEvent[];
    receipts?: SettlementSourceEvent[];
}

export interface SettlementSourceOrder {
    id: number;
    code: string;
    party: { id: number; code: string | null; name: string | null };
    lines: SettlementSourceLine[];
}

export interface SettlementOptions {
    books: SettlementBook[];
    customer_sources: SettlementSourceOrder[];
    supplier_sources: SettlementSourceOrder[];
    policy: {
        source_posting_enabled: boolean;
        partial_invoice_basis: string;
        tax_treatment: string;
        allocation_rule: string;
    };
    can_manage: boolean;
}

export interface SettlementInvoiceLine {
    id: number;
    line_number: number;
    source_line_id: number;
    item_code: string;
    item_name: string;
    unit_name: string;
    quantity_milli: string;
    quantity: string;
    amount_rial: string;
    source_amount_toman: string | null;
    source: {
        type: 'sales_delivery' | 'warehouse_receipt';
        id: number;
        operation_id: number | null;
        movement_id: number | null;
    };
}

export interface SettlementInvoice {
    id: number;
    code: string;
    direction: SettlementDirection;
    status: 'draft' | 'posted';
    currency: { code: string; scale: number };
    amount_rial: string;
    amount_toman: string | null;
    allocated_rial: string;
    outstanding_rial: string;
    outstanding_toman: string | null;
    effective_on: string;
    due_on: string;
    book: { id: number; code: string | null; name: string | null };
    party: { id: number; name: string | null };
    source: { type: 'sales_order' | 'purchase_order'; id: number; code: string | null };
    journal: { id: number; code: string; status: string; accounting_date: string; debit_total_rial: string; credit_total_rial: string } | null;
    lines: SettlementInvoiceLine[];
    allocations: Array<{
        id: number;
        amount_rial: string;
        effective_on: string | null;
        open_item_id: number;
        treasury_movement: {
            id: number;
            type: 'customer_receipt' | 'supplier_payment';
            amount_rial: string;
            reference: string | null;
            journal: { id: number; code: string } | null;
        } | null;
    }>;
    open_item: { id: number; original_amount_rial: string; effective_on: string; due_on: string } | null;
    created_by: number;
    posted_by: number;
    posted_at: string | null;
}

export interface SettlementRecord {
    movement: {
        id: number;
        type: 'customer_receipt' | 'supplier_payment';
        amount_rial: string;
        effective_on: string;
        reference: string | null;
        party: { id: number; name: string | null };
        treasury_account: { id: number; code: string | null; name: string | null };
        journal: { id: number; code: string } | null;
    };
    allocation: { id: number; invoice_id: number; open_item_id: number; amount_rial: string; journal_id: number };
}

export class SettlementApiError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
        this.name = 'SettlementApiError';
    }
}

interface ApiEnvelope<T> {
    data: T;
    already_exists?: boolean;
    can_manage?: boolean;
}

function csrfToken(): string {
    const token = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content;
    if (!token) throw new Error('درخواست امن قابل آماده‌سازی نیست؛ توکن CSRF صفحه موجود نیست.');
    return token;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
    const response = await fetch(path, {
        ...init,
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            ...(init.method && init.method !== 'GET' ? { 'X-CSRF-TOKEN': csrfToken() } : {}),
            ...init.headers,
        },
    });
    const payload = await response.json().catch(() => null) as ({ message?: string; errors?: Record<string, string[]> } & Partial<ApiEnvelope<T>>) | null;
    if (!response.ok) {
        const validation = payload?.errors ? Object.values(payload.errors).flat()[0] : null;
        throw new SettlementApiError(response.status, validation ?? payload?.message ?? `درخواست با کد ${response.status} انجام نشد.`);
    }
    if (payload === null || !('data' in payload)) throw new SettlementApiError(response.status, 'پاسخ سرور قالب مورد انتظار را ندارد.');

    return payload as ApiEnvelope<T>;
}

export async function fetchSettlementOptions(signal?: AbortSignal): Promise<SettlementOptions> {
    const payload = await request<SettlementOptions>('/api/v1/settlements/options', { signal });

    return { ...payload.data, can_manage: Boolean(payload.can_manage) };
}

export async function fetchSettlementInvoices(direction?: SettlementDirection, signal?: AbortSignal): Promise<SettlementInvoice[]> {
    const query = direction ? `?direction=${direction}` : '';
    const payload = await request<SettlementInvoice[]>(`/api/v1/settlements/invoices${query}`, { signal });

    return payload.data;
}

export async function createCustomerInvoice(
    salesOrderId: number,
    input: { book_id: number; effective_on: string; due_on: string; lines: Array<{ sales_order_line_id: number; sales_order_delivery_id: number; quantity_milli: string }> },
    idempotencyKey: string,
): Promise<{ invoice: SettlementInvoice; already_exists: boolean }> {
    const payload = await request<SettlementInvoice>(`/api/v1/settlements/sales-orders/${salesOrderId}/customer-invoices`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(input),
    });

    return { invoice: payload.data, already_exists: Boolean(payload.already_exists) };
}

export async function createSupplierInvoice(
    purchaseOrderId: number,
    input: { book_id: number; effective_on: string; due_on: string; lines: Array<{ purchase_order_line_id: number; purchase_receipt_id: number; quantity_milli: string }> },
    idempotencyKey: string,
): Promise<{ invoice: SettlementInvoice; already_exists: boolean }> {
    const payload = await request<SettlementInvoice>(`/api/v1/settlements/purchase-orders/${purchaseOrderId}/supplier-invoices`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(input),
    });

    return { invoice: payload.data, already_exists: Boolean(payload.already_exists) };
}

export async function settleCustomerInvoice(
    invoiceId: number,
    input: { amount_rial: string; effective_on: string; reference: string },
    idempotencyKey: string,
): Promise<{ record: SettlementRecord; invoice: SettlementInvoice; already_exists: boolean }> {
    return settle(`/api/v1/settlements/customer-invoices/${invoiceId}/receipts`, input, idempotencyKey);
}

export async function paySupplierInvoice(
    invoiceId: number,
    input: { amount_rial: string; effective_on: string; reference: string },
    idempotencyKey: string,
): Promise<{ record: SettlementRecord; invoice: SettlementInvoice; already_exists: boolean }> {
    return settle(`/api/v1/settlements/supplier-invoices/${invoiceId}/payments`, input, idempotencyKey);
}

async function settle(
    path: string,
    input: { amount_rial: string; effective_on: string; reference: string },
    idempotencyKey: string,
): Promise<{ record: SettlementRecord; invoice: SettlementInvoice; already_exists: boolean }> {
    const response = await fetch(path, {
        method: 'POST', credentials: 'same-origin',
        headers: {
            Accept: 'application/json', 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest',
            'X-CSRF-TOKEN': csrfToken(), 'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(input),
    });
    const payload = await response.json().catch(() => null) as { data?: SettlementRecord; invoice?: SettlementInvoice; already_exists?: boolean; message?: string; errors?: Record<string, string[]> } | null;
    if (!response.ok || !payload?.data || !payload.invoice) {
        const validation = payload?.errors ? Object.values(payload.errors).flat()[0] : null;
        throw new SettlementApiError(response.status, validation ?? payload?.message ?? `درخواست با کد ${response.status} انجام نشد.`);
    }

    return { record: payload.data, invoice: payload.invoice, already_exists: Boolean(payload.already_exists) };
}
