import { ApiError } from './masterData';

export type PartyImportClassification = 'valid' | 'duplicate' | 'invalid';
export type PartyImportOutcome = PartyImportClassification | 'pending' | 'created';

export interface PartyImportRow {
    source_row: number;
    source_party_id: string | null;
    party_code: string | null;
    display_name: string | null;
    roles: Array<'customer' | 'supplier'>;
    roles_text?: string;
    classification: PartyImportClassification;
    outcome?: PartyImportOutcome;
    message: string | null;
    party_id?: number | null;
}

export interface PartyImportPreview {
    payload_hash: string;
    counts: { valid: number; duplicate: number; invalid: number; created: number; pending: number };
    rows: PartyImportRow[];
}

export interface PartyImportResult extends PartyImportPreview {
    import_key: string;
    status: 'applying' | 'completed';
}

function csrfToken(): string {
    return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
}

async function postFile<T>(path: string, file: File, options: { importKey?: string; payloadHash?: string } = {}): Promise<T> {
    const body = new FormData();
    body.append('file', file);
    if (options.payloadHash) body.append('payload_hash', options.payloadHash);

    const response = await fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'X-CSRF-TOKEN': csrfToken(),
            ...(options.importKey ? { 'Idempotency-Key': options.importKey } : {}),
        },
        body,
    });
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
        const body = typeof payload === 'object' && payload !== null ? payload as { message?: unknown; errors?: unknown } : {};
        const errors = typeof body.errors === 'object' && body.errors !== null ? body.errors as Record<string, string[]> : {};
        const firstError = Object.values(errors).flat().find((item) => typeof item === 'string');
        throw new ApiError(response.status, typeof body.message === 'string' ? firstError ?? body.message : `درخواست ناموفق بود (${response.status}).`, errors);
    }

    const data = typeof payload === 'object' && payload !== null ? (payload as { data?: T }).data : undefined;
    if (!data) throw new Error('ساختار پاسخ تبادل طرف تجاری معتبر نیست.');

    return data;
}

export function previewPartyImport(file: File): Promise<PartyImportPreview> {
    return postFile('/api/v1/parties/import/preview', file);
}

export function applyPartyImport(file: File, importKey: string, payloadHash: string): Promise<PartyImportResult> {
    return postFile('/api/v1/parties/import/apply', file, { importKey, payloadHash });
}

export interface OrganizationMember {
    id: number;
    user_id: number;
    name: string;
    email: string;
    role: 'reader' | 'editor';
    role_manager: boolean;
}

export interface MembershipRoleAudit {
    id: number;
    actor: { id: number; name: string; email: string } | null;
    source: string;
    prior_role: 'reader' | 'editor' | null;
    new_role: 'reader' | 'editor';
    created_at: string | null;
}

export interface MembershipRoleHistory {
    membership: { id: number; user_id: number };
    data: MembershipRoleAudit[];
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

export async function fetchOrganizationMembers(signal?: AbortSignal): Promise<OrganizationMember[]> {
    const response = await request<{ data: OrganizationMember[] }>('/api/v1/organization/memberships', { signal });
    return response.data;
}

export async function fetchMembershipRoleHistory(membershipId: number, signal?: AbortSignal): Promise<MembershipRoleHistory> {
    return request<MembershipRoleHistory>(`/api/v1/organization/memberships/${membershipId}/role-history`, { signal });
}

export async function updateMembershipRole(
    membershipId: number,
    values: { role: 'reader' | 'editor'; expected_role: 'reader' | 'editor' },
): Promise<{ data: OrganizationMember; changed: boolean }> {
    return request(`/api/v1/organization/memberships/${membershipId}/role`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': csrfToken(),
        },
        body: JSON.stringify(values),
    });
}
