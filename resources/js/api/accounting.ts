export type AccountCategory = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface AccountingBook {
    id: number;
    code: string;
    name: string;
    currency: { code: 'IRR'; scale: 0 };
    time_zone: string;
}

export interface AccountingAccount {
    id: number;
    book_id: number;
    parent: { id: number; code: string; name: string } | null;
    code: string;
    name: string;
    category: AccountCategory;
    is_postable: boolean;
    is_active: boolean;
}

export interface AccountingPeriod {
    id: number;
    book_id: number;
    code: string;
    name: string;
    starts_on: string;
    ends_on: string;
    status: 'open' | 'closed';
    closed_by: string | null;
    closed_at: string | null;
}

export interface AccountingOptions {
    books: AccountingBook[];
    selected_book_id: number | null;
    accounts: AccountingAccount[];
    periods: AccountingPeriod[];
}

export interface AccountingJournalLine {
    id: number;
    line_number: number;
    account: { id: number; code: string; name: string; category: AccountCategory };
    memo: string | null;
    debit_rial: string;
    credit_rial: string;
}

export interface AccountingJournal {
    id: number;
    code: string;
    status: 'draft' | 'posted';
    accounting_date: string;
    description: string;
    book: AccountingBook;
    period: AccountingPeriod | null;
    lines: AccountingJournalLine[];
    debit_total_rial: string;
    credit_total_rial: string;
    created_by: string | null;
    posted_by: string | null;
    posted_at: string | null;
    posting_identity: string | null;
    source_reference: { type: string; record_id: string; event_key: string } | null;
    reversal_of: { id: number; code: string } | null;
    reversal: { id: number; code: string; accounting_date: string } | null;
}

export class AccountingApiError extends Error {
    constructor(readonly status: number, message: string, readonly errors: Record<string, string[]> = {}) {
        super(message);
        this.name = 'AccountingApiError';
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
        const message = typeof firstError === 'string'
            ? firstError
            : typeof body.message === 'string'
                ? body.message
                : `درخواست ناموفق بود (${response.status}).`;
        throw new AccountingApiError(response.status, message, errors);
    }

    return payload as T;
}

function mutate<T>(path: string, method: 'POST' | 'PUT', input?: unknown, key?: string): Promise<T> {
    return request(path, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': csrfToken(),
            ...(key ? { 'Idempotency-Key': key } : {}),
        },
        body: input === undefined ? undefined : JSON.stringify(input),
    });
}

export async function fetchAccountingOptions(bookId?: number, signal?: AbortSignal): Promise<{ data: AccountingOptions; can_manage: boolean }> {
    const query = bookId ? `?book_id=${bookId}` : '';
    return request(`/api/v1/accounting/options${query}`, { signal });
}

export async function fetchAccountingJournals(bookId?: number, signal?: AbortSignal): Promise<AccountingJournal[]> {
    const query = bookId ? `?book_id=${bookId}` : '';
    return (await request<{ data: AccountingJournal[] }>(`/api/v1/accounting/journals${query}`, { signal })).data;
}

export async function fetchAccountingJournal(id: number, signal?: AbortSignal): Promise<AccountingJournal> {
    return (await request<{ data: AccountingJournal }>(`/api/v1/accounting/journals/${id}`, { signal })).data;
}

export async function createAccountingBook(input: { code: string; name: string; time_zone: string }): Promise<AccountingBook> {
    return (await mutate<{ data: AccountingBook }>('/api/v1/accounting/books', 'POST', input)).data;
}

export async function createAccountingAccount(bookId: number, input: {
    parent_account_id: number | null;
    code: string;
    name: string;
    category: AccountCategory;
    is_postable: boolean;
}): Promise<AccountingAccount> {
    return (await mutate<{ data: AccountingAccount }>(`/api/v1/accounting/books/${bookId}/accounts`, 'POST', input)).data;
}

export async function createAccountingPeriod(bookId: number, input: {
    code: string;
    name: string;
    starts_on: string;
    ends_on: string;
}): Promise<AccountingPeriod> {
    return (await mutate<{ data: AccountingPeriod }>(`/api/v1/accounting/books/${bookId}/periods`, 'POST', input)).data;
}

export async function closeAccountingPeriod(id: number): Promise<AccountingPeriod> {
    return (await mutate<{ data: AccountingPeriod }>(`/api/v1/accounting/periods/${id}/close`, 'POST', {})).data;
}

export interface AccountingJournalInput {
    accounting_date: string;
    description: string;
    lines: { account_id: number; memo: string; debit_rial: string; credit_rial: string }[];
}

export async function createAccountingDraft(bookId: number, input: AccountingJournalInput): Promise<AccountingJournal> {
    return (await mutate<{ data: AccountingJournal }>('/api/v1/accounting/journals', 'POST', { book_id: bookId, ...input })).data;
}

export async function updateAccountingDraft(id: number, input: AccountingJournalInput): Promise<AccountingJournal> {
    return (await mutate<{ data: AccountingJournal }>(`/api/v1/accounting/journals/${id}`, 'PUT', input)).data;
}

export async function postAccountingDraft(id: number, key: string): Promise<{ journal: AccountingJournal; already_exists: boolean }> {
    const result = await mutate<{ data: AccountingJournal; already_exists: boolean }>(`/api/v1/accounting/journals/${id}/post`, 'POST', {}, key);
    return { journal: result.data, already_exists: result.already_exists };
}

export async function reverseAccountingJournal(id: number, input: { accounting_date: string; reason: string }, key: string): Promise<{ journal: AccountingJournal; already_exists: boolean }> {
    const result = await mutate<{ data: AccountingJournal; already_exists: boolean }>(`/api/v1/accounting/journals/${id}/reverse`, 'POST', input, key);
    return { journal: result.data, already_exists: result.already_exists };
}
