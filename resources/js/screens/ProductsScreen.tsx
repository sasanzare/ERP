import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
    fetchProducts,
    fetchWorkspaceContext,
    selectOrganization,
    signOut,
    updateProductName,
    type Product,
    type WorkspaceContext,
} from '../api/products';
import { GlassButton } from '../components/GlassButton';
import { GlassSearchField } from '../components/GlassSearchField';
import { ProductQuickViewDialog } from '../components/ProductQuickViewDialog';
import { WorkspaceShell } from '../components/WorkspaceShell';

type LoadState = 'loading' | 'success' | 'error';
type WorkspacePage = 'list' | 'detail';

function currentRoute(): { page: WorkspacePage; productId: number | null } {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    if (path === '/' || path === '/products') return { page: 'list', productId: null };

    const match = /^\/products\/(\d+)$/.exec(path);
    return match ? { page: 'detail', productId: Number(match[1]) } : { page: 'list', productId: null };
}

function workspaceHref(path: string): string {
    const currentParams = new URLSearchParams(window.location.search);
    const preserved = new URLSearchParams();
    for (const key of ['glass', 'scene']) {
        const value = currentParams.get(key);
        if (value) preserved.set(key, value);
    }
    const query = preserved.toString();
    return query ? `${path}?${query}` : path;
}

function RefreshIcon() {
    return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
            <path d="M16.3 7.1A6.7 6.7 0 0 0 4.8 4.8L3.2 6.4M3.2 6.4V3.5M3.2 6.4h2.9M3.7 12.9a6.7 6.7 0 0 0 11.5 2.3l1.6-1.6m0 0v2.9m0-2.9h-2.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function EmptyState({ filtered }: { filtered: boolean }) {
    return (
        <div className="state-panel" role="status">
            <span className="state-icon empty-icon" aria-hidden="true">{filtered ? '⌕' : '—'}</span>
            <h2>{filtered ? 'نتیجه‌ای پیدا نشد' : 'هنوز کالایی ثبت نشده است'}</h2>
            <p>{filtered ? 'نام یا کد دیگری را جست‌وجو کنید.' : 'با دریافت داده از API، کالاها در این فهرست نمایش داده می‌شوند.'}</p>
        </div>
    );
}

function LoadingState() {
    return (
        <div className="state-panel loading-panel" role="status" aria-live="polite">
            <span className="loading-mark" aria-hidden="true" />
            <h2>در حال دریافت کالاها</h2>
            <p>اطلاعات از پایگاه دادهٔ محلی خوانده می‌شود.</p>
            <span className="loading-line" />
            <span className="loading-line loading-line-short" />
        </div>
    );
}

function ErrorState({ onRetry, forceFallback }: { onRetry: () => void; forceFallback: boolean }) {
    return (
        <div className="state-panel error-panel" role="alert">
            <span className="state-icon error-icon" aria-hidden="true">!</span>
            <h2>ارتباط با سرویس برقرار نشد</h2>
            <p>اتصال محلی را بررسی کنید و دوباره تلاش کنید.</p>
            <GlassButton variant="tinted" onClick={onRetry} forceFallback={forceFallback}>
                تلاش دوباره
            </GlassButton>
        </div>
    );
}

function ProductRegister({
    products,
    filter,
    onFilterChange,
    onOpenQuickView,
    forceFallback,
}: {
    products: Product[];
    filter: string;
    onFilterChange: (value: string) => void;
    onOpenQuickView: (product: Product, trigger: HTMLButtonElement) => void;
    forceFallback: boolean;
}) {
    const needle = filter.trim().toLocaleLowerCase();
    const matches = products.filter((product) => (
        `${product.name} ${product.code}`.toLocaleLowerCase().includes(needle)
    ));

    return (
        <section className="focus-content" aria-labelledby="register-title" data-lg-role="focus" aria-busy="false">
            <div className="surface-heading">
                <div>
                    <p className="eyebrow">فهرست اطلاعات پایه</p>
                    <h2 id="register-title">کالاهای ثبت‌شده</h2>
                </div>
                <span className="result-count" aria-live="polite">
                    <bdi dir="ltr">{matches.length.toString().padStart(2, '0')}</bdi>
                    <span>مورد</span>
                </span>
            </div>

            {products.length === 0 ? (
                <EmptyState filtered={false} />
            ) : matches.length === 0 ? (
                <EmptyState filtered />
            ) : (
                <div className="table-scroll-region">
                    <table className="product-table">
                        <caption className="visually-hidden">فهرست کالاهای ثبت‌شده</caption>
                        <thead>
                            <tr>
                                <th scope="col">نام کالا</th>
                                <th scope="col">کد کالا</th>
                                <th scope="col"><span className="visually-hidden">عملیات</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {matches.map((product) => (
                                <tr key={product.id}>
                                    <th scope="row">
                                        <a className="product-name-link" href={workspaceHref(`/products/${product.id}`)}>
                                            <span className="product-avatar" aria-hidden="true">{product.name.trim().slice(0, 1)}</span>
                                            <span>{product.name}</span>
                                        </a>
                                    </th>
                                    <td><bdi className="product-code" dir="ltr">{product.code}</bdi></td>
                                    <td className="row-actions">
                                        <a className="row-detail-link" href={workspaceHref(`/products/${product.id}`)}>جزئیات</a>
                                        <GlassButton
                                            className="quick-view-trigger"
                                            aria-label={`نمایش سریع ${product.name}`}
                                            onClick={(event) => onOpenQuickView(product, event.currentTarget)}
                                            forceFallback={forceFallback}
                                        >
                                            نمایش سریع
                                        </GlassButton>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <div className="register-footnote">
                <span className="footnote-dot" aria-hidden="true" />
                <span>نمایش فقط بر اساس داده‌های دریافتی از API است.</span>
                <bdi dir="ltr">{matches.length} / {products.length}</bdi>
            </div>
        </section>
    );
}

function ProductDetail({
    product,
    canEdit,
    onUpdateName,
}: {
    product: Product;
    canEdit: boolean;
    onUpdateName: (productId: number, name: string) => Promise<void>;
}) {
    const [name, setName] = useState(product.name);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => setName(product.name), [product.id, product.name]);

    async function submitName(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        setMessage('');

        try {
            await onUpdateName(product.id, name.trim());
            setMessage('نام کالا ذخیره شد.');
        } catch {
            setMessage('ذخیرهٔ تغییر انجام نشد؛ دوباره تلاش کنید.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <section className="focus-content detail-content" aria-labelledby="detail-title" data-lg-role="focus">
            <div className="detail-topline">
                <a className="back-link" href={workspaceHref('/products')}>
                    <span aria-hidden="true">→</span>
                    بازگشت به فهرست
                </a>
                <span className="detail-id"><span>شناسه</span> <bdi dir="ltr">{product.id}</bdi></span>
            </div>
            <div className="product-detail-card">
                <div className="detail-art" aria-hidden="true">
                    <span className="detail-orbit detail-orbit-one" />
                    <span className="detail-orbit detail-orbit-two" />
                    <span className="detail-art-core">{product.name.trim().slice(0, 1)}</span>
                </div>
                <div className="detail-copy">
                    <p className="eyebrow">مشخصات ثبت‌شده</p>
                    <h2 id="detail-title">{product.name}</h2>
                    {canEdit && (
                        <form className="product-edit-form" onSubmit={submitName}>
                            <label htmlFor="product-display-name">نام نمایشی کالا</label>
                            <input
                                id="product-display-name"
                                name="name"
                                value={name}
                                maxLength={255}
                                required
                                onChange={(event) => setName(event.currentTarget.value)}
                            />
                            <GlassButton type="submit" variant="tinted" disabled={saving || name.trim() === product.name}>
                                {saving ? 'در حال ذخیره' : 'ذخیرهٔ نام'}
                            </GlassButton>
                            <span className="edit-result" role="status" aria-live="polite">{message}</span>
                        </form>
                    )}
                    <dl className="detail-fields">
                        <div className="detail-field">
                            <dt>نام کالا</dt>
                            <dd>{product.name}</dd>
                        </div>
                        <div className="detail-field">
                            <dt>کد کالا</dt>
                            <dd><bdi dir="ltr">{product.code}</bdi></dd>
                        </div>
                        <div className="detail-field">
                            <dt>شناسه</dt>
                            <dd><bdi dir="ltr">{product.id}</bdi></dd>
                        </div>
                    </dl>
                    <a className="detail-register-link" href={workspaceHref('/products')}>
                        بازگشت به فهرست کالاها
                    </a>
                </div>
            </div>
        </section>
    );
}

function UnknownProduct({ productId }: { productId: number }) {
    return (
        <section className="focus-content" aria-labelledby="unknown-title" data-lg-role="focus">
            <div className="state-panel unknown-panel" role="status">
                <span className="state-icon empty-icon" aria-hidden="true">?</span>
                <h2 id="unknown-title">کالا پیدا نشد</h2>
                <p>کالایی با شناسهٔ <bdi dir="ltr">{productId}</bdi> در داده‌های دریافت‌شده وجود ندارد.</p>
                <a className="detail-register-link" href={workspaceHref('/products')}>بازگشت به فهرست کالاها</a>
            </div>
        </section>
    );
}

export function ProductsScreen() {
    const route = currentRoute();
    const [products, setProducts] = useState<Product[]>([]);
    const [context, setContext] = useState<WorkspaceContext | null>(null);
    const [state, setState] = useState<LoadState>('loading');
    const [attempt, setAttempt] = useState(0);
    const [switchingOrganization, setSwitchingOrganization] = useState(false);
    const [filter, setFilter] = useState('');
    const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
    const returnFocusRef = useRef<HTMLButtonElement>(null);
    const forceFallback = new URLSearchParams(window.location.search).get('glass') === 'fallback';
    const product = route.productId === null
        ? null
        : products.find((candidate) => candidate.id === route.productId) ?? null;
    const navigationProduct = route.page === 'detail' ? product : products[0];
    const detailHref = route.page === 'detail' && route.productId !== null
        ? workspaceHref(`/products/${route.productId}`)
        : navigationProduct
            ? workspaceHref(`/products/${navigationProduct.id}`)
            : undefined;
    const connectionLabel = state === 'loading'
        ? 'در حال دریافت داده'
        : state === 'error'
            ? 'اتصال نیاز به بررسی دارد'
            : 'داده دریافت شد';

    useEffect(() => {
        const controller = new AbortController();
        let mounted = true;
        setState('loading');

        fetchWorkspaceContext(controller.signal)
            .then(async (workspace) => ({ workspace, products: await fetchProducts(controller.signal) }))
            .then(({ workspace, products: result }) => {
                if (!mounted) return;
                setContext(workspace);
                setProducts(result);
                setState('success');
            })
            .catch((error: unknown) => {
                if (!mounted || (error instanceof DOMException && error.name === 'AbortError')) return;
                setState('error');
            });

        return () => {
            mounted = false;
            controller.abort();
        };
    }, [attempt]);

    const retry = () => setAttempt((current) => current + 1);

    async function changeOrganization(organizationId: number) {
        setSwitchingOrganization(true);

        try {
            await selectOrganization(organizationId);
            const workspace = await fetchWorkspaceContext();
            const nextProducts = await fetchProducts();
            setContext(workspace);
            setProducts(nextProducts);
            setState('success');
        } catch {
            setState('error');
        } finally {
            setSwitchingOrganization(false);
        }
    }

    async function saveProductName(productId: number, name: string) {
        const savedProduct = await updateProductName(productId, name);
        setProducts((current) => current.map((item) => item.id === savedProduct.id ? savedProduct : item));
    }

    async function exitSession() {
        try {
            await signOut();
        } catch {
            setState('error');
        }
    }

    const toolbar = (
        <>
            <div className="toolbar-leading">
                {route.page === 'list' ? (
                    <GlassSearchField
                        label="جست‌وجوی کالا بر اساس نام یا کد"
                        value={filter}
                        placeholder="نام یا کد کالا را بنویسید"
                        onChange={setFilter}
                    />
                ) : (
                    <span className="toolbar-context-label">{product ? 'جزئیات کالای انتخاب‌شده' : 'نمایش جزئیات کالا'}</span>
                )}
            </div>
            <div className="toolbar-actions">
                <span className={`toolbar-state toolbar-state-${state}`} aria-live="polite">
                    <span className="connection-indicator" aria-hidden="true" />
                    {connectionLabel}
                </span>
                <GlassButton
                    className="refresh-button"
                    variant="tinted"
                    onClick={retry}
                    disabled={state === 'loading'}
                    forceFallback={forceFallback}
                >
                    <RefreshIcon />
                    <span>{state === 'loading' ? 'در حال دریافت' : 'به‌روزرسانی'}</span>
                </GlassButton>
            </div>
        </>
    );

    if (context === null) {
        return (
            <main className="app-shell" data-lg-role="stage">
                <section className="focus-content" data-lg-role="focus" aria-busy={state === 'loading'}>
                    {state === 'loading' ? <LoadingState /> : <ErrorState onRetry={retry} forceFallback={forceFallback} />}
                </section>
            </main>
        );
    }

    return (
        <WorkspaceShell
            title={route.page === 'list' ? 'کالاها' : 'جزئیات کالا'}
            eyebrow={route.page === 'list' ? 'مدیریت اطلاعات پایه' : 'فهرست کالاها / جزئیات'}
            subtitle={route.page === 'list' ? 'جست‌وجو و مرور اطلاعات ثبت‌شده' : 'مشاهدهٔ مشخصات دریافت‌شده از سرویس کالاها'}
            activePage={route.page}
            connectionState={state === 'success' ? 'ready' : state}
            connectionLabel={connectionLabel}
            detailHref={detailHref}
            detailLabel={navigationProduct?.name ?? (route.productId === null ? undefined : `شناسه ${route.productId}`)}
            toolbar={toolbar}
            forceFallback={forceFallback}
            activeOrganization={context.active_organization}
            organizations={context.organizations}
            onOrganizationChange={changeOrganization}
            onSignOut={exitSession}
            organizationSwitching={switchingOrganization}
        >
            {state === 'loading' ? (
                <section className="focus-content" data-lg-role="focus" aria-busy="true">
                    <LoadingState />
                </section>
            ) : state === 'error' ? (
                <section className="focus-content" data-lg-role="focus" aria-busy="false">
                    <ErrorState onRetry={retry} forceFallback={forceFallback} />
                </section>
            ) : route.page === 'detail' && route.productId !== null ? (
                product ? (
                    <ProductDetail
                        product={product}
                        canEdit={context.capabilities.products.update}
                        onUpdateName={saveProductName}
                    />
                ) : <UnknownProduct productId={route.productId} />
            ) : (
                <ProductRegister
                    products={products}
                    filter={filter}
                    onFilterChange={setFilter}
                    onOpenQuickView={(selected, trigger) => {
                        returnFocusRef.current = trigger;
                        setQuickViewProduct(selected);
                    }}
                    forceFallback={forceFallback}
                />
            )}

            <ProductQuickViewDialog
                product={quickViewProduct}
                returnFocusRef={returnFocusRef}
                onClose={() => setQuickViewProduct(null)}
                forceFallback={forceFallback}
                detailHref={quickViewProduct ? workspaceHref(`/products/${quickViewProduct.id}`) : '/products'}
            />
        </WorkspaceShell>
    );
}
