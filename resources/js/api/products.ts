export interface Product {
    id: number;
    code: string;
    name: string;
}

export interface OrganizationMembership {
    id: number;
    name: string;
    role: 'reader' | 'editor';
}

export interface WorkspaceContext {
    active_organization: OrganizationMembership;
    organizations: OrganizationMembership[];
    capabilities: {
        master_data: { manage: boolean };
        products: { update: boolean };
        sales: { manage: boolean };
    };
}

interface ProductResponse {
    data: Product[];
}

export async function fetchProducts(signal?: AbortSignal): Promise<Product[]> {
    const response = await fetch('/api/v1/products', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        signal,
    });

    if (!response.ok) {
        throw new Error('Product request failed.');
    }

    const payload: unknown = await response.json();

    if (
        typeof payload !== 'object' ||
        payload === null ||
        !('data' in payload) ||
        !Array.isArray((payload as ProductResponse).data)
    ) {
        throw new Error('Product response did not match the expected contract.');
    }

    return (payload as ProductResponse).data;
}

function csrfToken(): string {
    return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
}

async function readJson(response: Response): Promise<unknown> {
    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}.`);
    }

    return response.json();
}

export async function fetchWorkspaceContext(signal?: AbortSignal): Promise<WorkspaceContext> {
    const response = await fetch('/api/v1/workspace', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        signal,
    });
    const payload = await readJson(response) as WorkspaceContext;

    if (
        !payload.active_organization ||
        !Array.isArray(payload.organizations) ||
        typeof payload.capabilities?.products?.update !== 'boolean' ||
        typeof payload.capabilities?.master_data?.manage !== 'boolean' ||
        typeof payload.capabilities?.sales?.manage !== 'boolean'
    ) {
        throw new Error('Workspace context did not match the expected contract.');
    }

    return payload;
}

export async function selectOrganization(organizationId: number): Promise<void> {
    const response = await fetch('/api/v1/active-organization', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': csrfToken(),
        },
        body: JSON.stringify({ organization_id: organizationId }),
    });

    await readJson(response);
}

export async function updateProductName(productId: number, name: string): Promise<Product> {
    const response = await fetch(`/api/v1/products/${productId}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': csrfToken(),
        },
        body: JSON.stringify({ name }),
    });
    const payload = await readJson(response) as { data?: Product };

    if (!payload.data || typeof payload.data.id !== 'number' || typeof payload.data.name !== 'string') {
        throw new Error('Product update response did not match the expected contract.');
    }

    return payload.data;
}

export async function signIn(email: string, password: string): Promise<void> {
    const response = await fetch('/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': csrfToken(),
        },
        body: JSON.stringify({ email, password }),
    });
    const payload = await readJson(response) as { redirect?: string };

    if (typeof payload.redirect !== 'string') {
        throw new Error('Sign-in response did not include a destination.');
    }

    window.location.assign(payload.redirect);
}

export async function signOut(): Promise<void> {
    const response = await fetch('/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'X-CSRF-TOKEN': csrfToken(),
        },
    });
    const payload = await readJson(response) as { redirect?: string };

    if (typeof payload.redirect !== 'string') {
        throw new Error('Sign-out response did not include a destination.');
    }

    window.location.assign(payload.redirect);
}
