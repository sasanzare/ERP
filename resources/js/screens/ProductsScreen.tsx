import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
    fetchProducts,
    fetchWorkspaceContext,
    selectOrganization,
    signOut,
    type Product,
    type WorkspaceContext,
} from '../api/products';
import { createProduct, fetchProductDetail, fetchUnits, updateProduct, type ProductDetailRecord, type UnitRecord } from '../api/masterData';
import { GlassButton } from '../components/GlassButton';
import { GlassSearchField } from '../components/GlassSearchField';
import { LabeledInput } from '../components/LabeledInput';
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

function ProductCreateForm({ units, onCancel, onCreate }: {
    units: UnitRecord[];
    onCancel: () => void;
    onCreate: (values: { code: string; name: string; base_unit_id: number | null }) => Promise<void>;
}) {
    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [baseUnitId, setBaseUnitId] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        setMessage('');
        try {
            await onCreate({ code: code.trim(), name: name.trim(), base_unit_id: baseUnitId ? Number(baseUnitId) : null });
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'ثبت کالا انجام نشد.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <form className="master-form product-create-form" onSubmit={submit} aria-label="ثبت کالای جدید">
            <div className="master-detail-heading"><p className="eyebrow">فرم مشترک اطلاعات پایه · کالا</p><h3>ثبت کالای جدید</h3></div>
            <div className="master-form-grid">
                <LabeledInput id="new-product-code" label="کد کالا" value={code} direction="ltr" maxLength={64} required onChange={setCode} />
                <LabeledInput id="new-product-name" label="نام نمایشی کالا" value={name} maxLength={255} required onChange={setName} />
                <label className="master-field" htmlFor="new-product-unit"><span>واحد پایه</span>
                    <select id="new-product-unit" value={baseUnitId} onChange={(event) => setBaseUnitId(event.currentTarget.value)}>
                        <option value="">نامشخص · بعداً تعیین می‌شود</option>
                        {units.filter((unit) => unit.is_active).map((unit) => <option key={unit.id} value={unit.id}>{unit.name} · {unit.symbol}</option>)}
                    </select>
                </label>
            </div>
            <div className="master-form-actions">
                <GlassButton type="submit" variant="tinted" disabled={saving}>{saving ? 'در حال ثبت' : 'ثبت کالا'}</GlassButton>
                <button className="dialog-dismiss-button" type="button" onClick={onCancel}>انصراف</button>
                <span className="edit-result" role="status" aria-live="polite">{message}</span>
            </div>
        </form>
    );
}

function ProductRegister({
    products,
    filter,
    onFilterChange,
    onOpenQuickView,
    forceFallback,
    canManage,
    units,
    onCreateProduct,
}: {
    products: Product[];
    filter: string;
    onFilterChange: (value: string) => void;
    onOpenQuickView: (product: Product, trigger: HTMLButtonElement) => void;
    forceFallback: boolean;
    canManage: boolean;
    units: UnitRecord[];
    onCreateProduct: (values: { code: string; name: string; base_unit_id: number | null }) => Promise<void>;
}) {
    const [creating, setCreating] = useState(false);
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
                {canManage && !creating && <GlassButton variant="tinted" onClick={() => setCreating(true)} forceFallback={forceFallback}>کالای جدید</GlassButton>}
            </div>

            {creating && <ProductCreateForm units={units} onCancel={() => setCreating(false)} onCreate={onCreateProduct} />}

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
    onUpdateProduct,
}: {
    product: Product;
    canEdit: boolean;
    onUpdateProduct: (productId: number, values: { code?: string; name?: string; base_unit_id?: number | null }) => Promise<ProductDetailRecord>;
}) {
    const [detail, setDetail] = useState<ProductDetailRecord | null>(null);
    const [units, setUnits] = useState<UnitRecord[]>([]);
    const [code, setCode] = useState(product.code);
    const [name, setName] = useState(product.name);
    const [baseUnitId, setBaseUnitId] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        const controller = new AbortController();
        fetchProductDetail(product.id, controller.signal).then((saved) => {
            setDetail(saved);
            setCode(saved.code);
            setName(saved.name);
            setBaseUnitId(saved.base_unit ? String(saved.base_unit.id) : '');
        }).catch(() => setMessage('جزئیات پایهٔ کالا بارگیری نشد.'));
        if (canEdit) fetchUnits(controller.signal).then(setUnits).catch(() => setUnits([]));
        return () => controller.abort();
    }, [canEdit, product.id]);

    async function submitProduct(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        setMessage('');

        try {
            const updated = await onUpdateProduct(product.id, {
                code: code.trim(),
                name: name.trim(),
                base_unit_id: baseUnitId ? Number(baseUnitId) : null,
            });
            setDetail(updated);
            setMessage('مشخصات کالا ذخیره شد.');
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
                        <form className="product-edit-form" onSubmit={submitProduct}>
                            <LabeledInput id="product-code" label="کد کالا" value={code} direction="ltr" maxLength={64} required onChange={setCode} />
                            <LabeledInput id="product-display-name" label="نام نمایشی کالا" value={name} maxLength={255} required onChange={setName} />
                            <label className="master-field" htmlFor="product-base-unit"><span>واحد پایه</span>
                                <select id="product-base-unit" value={baseUnitId} onChange={(event) => setBaseUnitId(event.currentTarget.value)}>
                                    <option value="">نامشخص · نیازمند تعیین آگاهانه</option>
                                    {units.filter((unit) => unit.is_active).map((unit) => <option key={unit.id} value={unit.id}>{unit.name} · {unit.symbol}</option>)}
                                </select>
                            </label>
                            <GlassButton type="submit" variant="tinted" disabled={saving || !detail || (code.trim() === detail.code && name.trim() === detail.name && baseUnitId === (detail.base_unit ? String(detail.base_unit.id) : ''))}>
                                {saving ? 'در حال ذخیره' : 'ذخیرهٔ مشخصات'}
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
                        <div className="detail-field">
                            <dt>واحد پایه</dt>
                            <dd>{detail?.base_unit ? `${detail.base_unit.name} · ${detail.base_unit.symbol}` : 'مشخص نشده است'}</dd>
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
    const [units, setUnits] = useState<UnitRecord[]>([]);
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
            .then(async (workspace) => {
                const [result, unitRows] = await Promise.all([
                    fetchProducts(controller.signal),
                    workspace.capabilities.master_data.manage ? fetchUnits(controller.signal) : Promise.resolve([]),
                ]);
                return { workspace, products: result, units: unitRows };
            })
            .then(({ workspace, products: result, units: unitRows }) => {
                if (!mounted) return;
                setContext(workspace);
                setProducts(result);
                setUnits(unitRows);
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
            const [nextProducts, nextUnits] = await Promise.all([
                fetchProducts(),
                workspace.capabilities.master_data.manage ? fetchUnits() : Promise.resolve([]),
            ]);
            setContext(workspace);
            setProducts(nextProducts);
            setUnits(nextUnits);
            setState('success');
        } catch {
            setState('error');
        } finally {
            setSwitchingOrganization(false);
        }
    }

    async function saveProductDetails(productId: number, values: { code?: string; name?: string; base_unit_id?: number | null }): Promise<ProductDetailRecord> {
        await updateProduct(productId, values);
        const [updatedProducts, updatedDetail] = await Promise.all([fetchProducts(), fetchProductDetail(productId)]);
        setProducts(updatedProducts);
        return updatedDetail;
    }

    async function createProductRecord(values: { code: string; name: string; base_unit_id: number | null }): Promise<void> {
        const created = await createProduct(values);
        window.location.assign(workspaceHref(`/products/${created.id}`));
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
            phaseLabel="P04"
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
                        onUpdateProduct={saveProductDetails}
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
                    canManage={context.capabilities.master_data.manage}
                    units={units}
                    onCreateProduct={createProductRecord}
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
