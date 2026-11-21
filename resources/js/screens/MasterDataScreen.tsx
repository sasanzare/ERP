import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
    ApiError,
    createResourceRecord,
    fetchMasterData,
    fetchResourceRecord,
    fetchWarehouseLocations,
    resolveListPrice,
    saveListPrice,
    updateResourceRecord,
    validateLocationSelection,
    type LocationRecord,
    type MasterDataRecord,
    type MasterDataResource,
    type PartyRecord,
    type PartyRole,
    type PriceListRecord,
    type PriceResolution,
    type UnitRecord,
    type WarehouseRecord,
} from '../api/masterData';
import { fetchProducts, fetchWorkspaceContext, selectOrganization, signOut, type Product, type WorkspaceContext } from '../api/products';
import { GlassButton } from '../components/GlassButton';
import { GlassSearchField } from '../components/GlassSearchField';
import { LabeledInput } from '../components/LabeledInput';
import { WorkspaceShell } from '../components/WorkspaceShell';

type LoadState = 'loading' | 'success' | 'error' | 'denied';
type RouteState = { resource: MasterDataResource; recordId: number | null; creating: boolean };
type FormValues = Record<string, string | string[] | boolean>;

const resourceNames: Record<MasterDataResource, { plural: string; singular: string; nameField: string }> = {
    parties: { plural: 'طرف‌های تجاری', singular: 'طرف تجاری', nameField: 'display_name' },
    units: { plural: 'واحدها', singular: 'واحد', nameField: 'name' },
    warehouses: { plural: 'انبارها', singular: 'انبار', nameField: 'name' },
    locations: { plural: 'مکان‌های نگهداری', singular: 'مکان', nameField: 'name' },
    'price-lists': { plural: 'فهرست‌های قیمت', singular: 'فهرست قیمت', nameField: 'name' },
};

const resourcePaths: MasterDataResource[] = ['parties', 'units', 'warehouses', 'locations', 'price-lists'];

function currentRoute(): RouteState {
    const path = window.location.pathname.replace(/\/+$/, '');
    for (const resource of resourcePaths) {
        const match = new RegExp(`^/${resource}(?:/(new|\\d+))?$`).exec(path);
        if (match) {
            const record = match[1] ?? null;
            return { resource, recordId: record && record !== 'new' ? Number(record) : null, creating: record === 'new' };
        }
    }

    return { resource: 'parties', recordId: null, creating: false };
}

function href(path: string): string {
    const current = new URLSearchParams(window.location.search);
    const preserved = new URLSearchParams();
    for (const key of ['glass', 'scene']) {
        const value = current.get(key);
        if (value) preserved.set(key, value);
    }
    const query = preserved.toString();
    return query ? `${path}?${query}` : path;
}

function initialValues(resource: MasterDataResource, record?: MasterDataRecord): FormValues {
    if (!record) {
        return {
            code: '', name: '', display_name: '', symbol: '', roles: ['customer'], is_active: true, warehouse_id: '',
        };
    }

    if (resource === 'parties') {
        const party = record as PartyRecord;
        return { code: party.code, display_name: party.display_name, roles: party.roles };
    }
    if (resource === 'units') {
        const unit = record as UnitRecord;
        return { code: unit.code, name: unit.name, symbol: unit.symbol, is_active: unit.is_active };
    }
    if (resource === 'locations') {
        const location = record as LocationRecord;
        return { code: location.code, name: location.name, warehouse_id: String(location.warehouse?.id ?? '') };
    }

    const namedRecord = record as WarehouseRecord | PriceListRecord;
    return { code: namedRecord.code, name: namedRecord.name };
}

function errorMessage(error: unknown): string {
    if (error instanceof ApiError) return error.message;
    return 'دریافت یا ذخیرهٔ اطلاعات انجام نشد. اتصال محلی را بررسی کنید.';
}

function formatRials(amount: string): string {
    try {
        return `${new Intl.NumberFormat('fa-IR').format(BigInt(amount))} ریال`;
    } catch {
        return `${amount} ریال`;
    }
}

function recordName(resource: MasterDataResource, record: MasterDataRecord): string {
    return resource === 'parties'
        ? (record as PartyRecord).display_name
        : (record as UnitRecord | WarehouseRecord | LocationRecord | PriceListRecord).name;
}

function recordSummary(resource: MasterDataResource, record: MasterDataRecord): string {
    if (resource === 'parties') {
        const roles = (record as PartyRecord).roles.map((role) => role === 'customer' ? 'مشتری' : 'تأمین‌کننده');
        return roles.join(' · ');
    }
    if (resource === 'units') return `نماد ${String((record as UnitRecord).symbol)}`;
    if (resource === 'locations') return `انبار: ${(record as LocationRecord).warehouse?.name ?? 'نامشخص'}`;
    if (resource === 'price-lists') {
        const list = record as PriceListRecord;
        return `${list.entry_count ?? list.entries?.length ?? 0} قیمت · ریال`;
    }
    return 'اطلاعات پایهٔ سازمان';
}

function EmptyState({ filtered, label }: { filtered: boolean; label: string }) {
    return (
        <div className="state-panel" role="status">
            <span className="state-icon empty-icon" aria-hidden="true">{filtered ? '⌕' : '—'}</span>
            <h2>{filtered ? 'نتیجه‌ای پیدا نشد' : `هنوز ${label} ثبت نشده است`}</h2>
            <p>{filtered ? 'کد یا نام دیگری را جست‌وجو کنید.' : 'با ثبت یک مورد، فهرست این سازمان تکمیل می‌شود.'}</p>
        </div>
    );
}

function ResourceRegister({
    resource, records, filter,
}: {
    resource: MasterDataResource; records: MasterDataRecord[]; filter: string;
}) {
    const [partyRole, setPartyRole] = useState<'all' | PartyRole>('all');
    const label = resourceNames[resource].plural;
    const matches = useMemo(() => records.filter((record) => {
        const needle = filter.trim().toLocaleLowerCase();
        const textMatch = `${record.code} ${recordName(resource, record)} ${recordSummary(resource, record)}`.toLocaleLowerCase().includes(needle);
        const roleMatch = resource !== 'parties' || partyRole === 'all' || (record as PartyRecord).roles.includes(partyRole);
        return textMatch && roleMatch;
    }), [filter, partyRole, records, resource]);

    return (
        <section className="focus-content master-register" aria-labelledby="register-title" data-lg-role="focus">
            <div className="surface-heading">
                <div>
                    <p className="eyebrow">دفترهای اطلاعات پایه</p>
                    <h2 id="register-title">{label}</h2>
                </div>
                <span className="result-count" aria-live="polite"><bdi dir="ltr">{matches.length}</bdi><span>مورد</span></span>
            </div>
            {resource === 'parties' && (
                <div className="role-filter" role="group" aria-label="فیلتر نقش طرف تجاری">
                    {([
                        ['all', 'همه'], ['customer', 'مشتری'], ['supplier', 'تأمین‌کننده'],
                    ] as const).map(([id, text]) => (
                        <button key={id} type="button" className={partyRole === id ? 'is-current' : ''} aria-pressed={partyRole === id} onClick={() => setPartyRole(id)}>{text}</button>
                    ))}
                </div>
            )}
            {records.length === 0 || matches.length === 0 ? (
                <EmptyState filtered={records.length > 0} label={label} />
            ) : (
                <div className="table-scroll-region">
                    <table className="product-table master-table">
                        <caption className="visually-hidden">فهرست {label}</caption>
                        <thead><tr><th scope="col">نام</th><th scope="col">کد</th><th scope="col">مشخصات</th><th scope="col">عملیات</th></tr></thead>
                        <tbody>
                            {matches.map((record) => (
                                <tr key={record.id}>
                                    <th scope="row">
                                        <a className="product-name-link" href={href(`/${resource}/${record.id}`)}>
                                            <span className="product-avatar" aria-hidden="true">{recordName(resource, record).slice(0, 1)}</span>
                                            <span>{recordName(resource, record)}</span>
                                        </a>
                                    </th>
                                    <td><bdi className="product-code" dir="ltr">{record.code}</bdi></td>
                                    <td className="master-summary">{recordSummary(resource, record)}</td>
                                    <td className="row-actions"><a className="row-detail-link" href={href(`/${resource}/${record.id}`)}>جزئیات</a></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <div className="register-footnote">
                <span className="footnote-dot" aria-hidden="true" />
                <span>اطلاعات این فهرست فقط متعلق به سازمان فعال است.</span>
                <bdi dir="ltr">{matches.length} / {records.length}</bdi>
            </div>
        </section>
    );
}

function MasterDataForm({
    resource, values, setValue, warehouses, canManage, saving, message, onSubmit,
}: {
    resource: MasterDataResource; values: FormValues; setValue: (key: string, value: string | string[] | boolean) => void;
    warehouses: WarehouseRecord[]; canManage: boolean; saving: boolean; message: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
    const name = resourceNames[resource].singular;
    const roles = (values.roles as string[] | undefined) ?? [];
    return (
        <form className="master-form" onSubmit={onSubmit} aria-label={`${name} ${canManage ? 'ویرایش' : 'مشاهده'}`}>
            <div className="master-form-grid">
                <LabeledInput id="master-code" label="کد" value={String(values.code ?? '')} direction="ltr" maxLength={64} required={canManage} disabled={!canManage} onChange={(value) => setValue('code', value)} />
                {resource === 'parties' ? (
                    <LabeledInput id="master-display-name" label="نام نمایشی" value={String(values.display_name ?? '')} maxLength={255} required={canManage} disabled={!canManage} onChange={(value) => setValue('display_name', value)} />
                ) : (
                    <LabeledInput id="master-name" label="نام" value={String(values.name ?? '')} maxLength={160} required={canManage} disabled={!canManage} onChange={(value) => setValue('name', value)} />
                )}
                {resource === 'units' && (
                    <>
                        <LabeledInput id="master-symbol" label="نماد واحد" value={String(values.symbol ?? '')} maxLength={32} required={canManage} disabled={!canManage} onChange={(value) => setValue('symbol', value)} />
                        <label className="master-field master-check-field" htmlFor="master-active">
                            <span>وضعیت</span>
                            <span className="master-checkbox-row"><input id="master-active" type="checkbox" checked={Boolean(values.is_active)} disabled={!canManage} onChange={(event) => setValue('is_active', event.currentTarget.checked)} /> فعال</span>
                        </label>
                    </>
                )}
                {resource === 'locations' && (
                    <label className="master-field" htmlFor="master-warehouse">
                        <span>انبار *</span>
                        <select id="master-warehouse" value={String(values.warehouse_id ?? '')} required={canManage} disabled={!canManage} onChange={(event) => setValue('warehouse_id', event.currentTarget.value)}>
                            <option value="">انتخاب انبار</option>
                            {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} · {warehouse.code}</option>)}
                        </select>
                    </label>
                )}
                {resource === 'parties' && (
                    <fieldset className="master-role-field">
                        <legend>نقش‌های طرف</legend>
                        {([
                            ['customer', 'مشتری'], ['supplier', 'تأمین‌کننده'],
                        ] as const).map(([role, label]) => (
                            <label key={role} className="master-checkbox-row">
                                <input type="checkbox" checked={roles.includes(role)} disabled={!canManage} onChange={(event) => {
                                    const next = event.currentTarget.checked ? [...roles, role] : roles.filter((candidate) => candidate !== role);
                                    setValue('roles', next);
                                }} />
                                {label}
                            </label>
                        ))}
                        <small>یک طرف می‌تواند هر دو نقش را با همان شناسه داشته باشد.</small>
                    </fieldset>
                )}
            </div>
            {canManage && (
                <div className="master-form-actions">
                    <GlassButton type="submit" variant="tinted" disabled={saving}>{saving ? 'در حال ذخیره' : 'ذخیرهٔ تغییرات'}</GlassButton>
                    <span className="edit-result" role="status" aria-live="polite">{message}</span>
                </div>
            )}
            {!canManage && <p className="master-readonly-note">دسترسی شما فقط برای مشاهده است.</p>}
        </form>
    );
}

function LocationSelectionCheck({ warehouses }: { warehouses: WarehouseRecord[] }) {
    const [warehouseId, setWarehouseId] = useState('');
    const [locationId, setLocationId] = useState('');
    const [locations, setLocations] = useState<LocationRecord[]>([]);
    const [message, setMessage] = useState('');

    useEffect(() => {
        const id = Number(warehouseId);
        setLocationId('');
        setLocations([]);
        if (!id) return;
        const controller = new AbortController();
        fetchWarehouseLocations(id, controller.signal).then(setLocations).catch(() => setLocations([]));
        return () => controller.abort();
    }, [warehouseId]);

    async function validatePair() {
        setMessage('');
        try {
            await validateLocationSelection(Number(warehouseId), Number(locationId));
            setMessage('انبار و مکان با هم تطبیق دارند.');
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }

    return (
        <section className="location-pair-check" aria-labelledby="pair-check-title">
            <div><p className="eyebrow">انتخاب وابسته</p><h3 id="pair-check-title">مکان از انبار انتخاب‌شده فیلتر می‌شود</h3></div>
            <div className="pair-fields">
                <label className="master-field" htmlFor="pair-warehouse"><span>انبار</span>
                    <select id="pair-warehouse" value={warehouseId} onChange={(event) => setWarehouseId(event.currentTarget.value)}>
                        <option value="">انتخاب انبار</option>{warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                </label>
                <label className="master-field" htmlFor="pair-location"><span>مکان</span>
                    <select id="pair-location" value={locationId} disabled={!warehouseId || locations.length === 0} onChange={(event) => setLocationId(event.currentTarget.value)}>
                        <option value="">انتخاب مکان</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.code}</option>)}
                    </select>
                </label>
                <GlassButton onClick={validatePair} disabled={!warehouseId || !locationId}>بررسی تطبیق</GlassButton>
            </div>
            <p className="edit-result" role="status" aria-live="polite">{message}</p>
        </section>
    );
}

function PriceListTools({
    list, lists, products, canManage, onChangeList, onRefresh,
}: {
    list: PriceListRecord; lists: PriceListRecord[]; products: Product[]; canManage: boolean;
    onChangeList: (id: number) => void; onRefresh: () => void;
}) {
    const [selectedProduct, setSelectedProduct] = useState('');
    const [amount, setAmount] = useState('');
    const [resolution, setResolution] = useState<PriceResolution | null>(null);
    const [message, setMessage] = useState('');
    const productId = Number(selectedProduct);

    useEffect(() => {
        if (!productId) {
            setResolution(null);
            return;
        }
        const controller = new AbortController();
        resolveListPrice(list.id, productId, controller.signal)
            .then((result) => { setResolution(result); setAmount(result.amount_rial ?? ''); })
            .catch((error: unknown) => setMessage(errorMessage(error)));
        return () => controller.abort();
    }, [list.id, productId]);

    async function savePrice(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setMessage('');
        try {
            await saveListPrice(list.id, productId, amount);
            setMessage('قیمت ریالی در این فهرست ذخیره شد.');
            const updated = await resolveListPrice(list.id, productId);
            setResolution(updated);
            onRefresh();
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }

    const selectedListId = String(list.id);
    const selectedResolution = resolution;

    return (
        <section className="price-list-tools" aria-labelledby="price-lookup-title">
            <div className="surface-heading"><div><p className="eyebrow">قیمت پایه</p><h3 id="price-lookup-title">قیمت از فهرست انتخاب‌شده</h3></div><span className="rial-label">مبالغ به ریال</span></div>
            <div className="price-selectors">
                <label className="master-field" htmlFor="price-list-selected"><span>فهرست قیمت</span>
                    <select id="price-list-selected" value={selectedListId} onChange={(event) => onChangeList(Number(event.currentTarget.value))}>
                        {lists.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.code}</option>)}
                    </select>
                </label>
                <label className="master-field" htmlFor="price-product-selected"><span>کالا</span>
                    <select id="price-product-selected" value={selectedProduct} onChange={(event) => { setMessage(''); setSelectedProduct(event.currentTarget.value); }}>
                        <option value="">انتخاب کالا</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.code}</option>)}
                    </select>
                </label>
            </div>
            {selectedResolution && (
                <div className={`price-resolution ${selectedResolution.priced ? 'is-priced' : 'is-unpriced'}`} role="status" aria-live="polite">
                    <span>{selectedResolution.priced ? 'قیمت ثبت‌شده' : 'بدون قیمت در این فهرست'}</span>
                    <strong dir="auto">{selectedResolution.priced && selectedResolution.amount_rial !== null ? formatRials(selectedResolution.amount_rial) : 'قیمتی ثبت نشده است'}</strong>
                    <small>{selectedResolution.unit ? `برای هر ${selectedResolution.unit.name} (${selectedResolution.unit.symbol})` : 'واحد پایهٔ این کالا هنوز مشخص نشده است'}</small>
                </div>
            )}
            {canManage && (
                <form className="price-entry-form" onSubmit={savePrice}>
                    <LabeledInput id="price-amount-rial" label="مبلغ هر واحد (ریال)" value={amount} direction="ltr" maxLength={20} required onChange={setAmount} placeholder="مثلاً 125000" />
                    <GlassButton type="submit" variant="tinted" disabled={!productId || !/^[0-9]{1,20}$/.test(amount)}>ذخیرهٔ قیمت</GlassButton>
                </form>
            )}
            <p className="edit-result" role="status" aria-live="polite">{message}</p>
        </section>
    );
}

export function MasterDataScreen() {
    const route = currentRoute();
    const [context, setContext] = useState<WorkspaceContext | null>(null);
    const [records, setRecords] = useState<MasterDataRecord[]>([]);
    const [record, setRecord] = useState<MasterDataRecord | null>(null);
    const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([]);
    const [priceLists, setPriceLists] = useState<PriceListRecord[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [values, setValues] = useState<FormValues>(initialValues(route.resource));
    const [state, setState] = useState<LoadState>('loading');
    const [attempt, setAttempt] = useState(0);
    const [filter, setFilter] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [switching, setSwitching] = useState(false);
    const forceFallback = new URLSearchParams(window.location.search).get('glass') === 'fallback';
    const config = resourceNames[route.resource];
    const canManage = context?.capabilities.master_data.manage ?? false;
    const title = route.recordId === null && !route.creating ? config.plural : route.creating ? `افزودن ${config.singular}` : `جزئیات ${config.singular}`;

    useEffect(() => {
        const controller = new AbortController();
        let mounted = true;
        setState('loading');
        setMessage('');

        async function load() {
            const workspace = await fetchWorkspaceContext(controller.signal);
            const [list, detail, warehouseRows, priceListRows, productRows] = await Promise.all([
                fetchMasterData(route.resource, '', controller.signal),
                route.recordId === null ? Promise.resolve(null) : fetchResourceRecord(route.resource, route.recordId, controller.signal),
                route.resource === 'locations' ? fetchMasterData<WarehouseRecord>('warehouses', '', controller.signal) : Promise.resolve([]),
                route.resource === 'price-lists' ? fetchMasterData<PriceListRecord>('price-lists', '', controller.signal) : Promise.resolve([]),
                route.resource === 'price-lists' ? fetchProducts(controller.signal) : Promise.resolve([]),
            ]);

            if (!mounted) return;
            setContext(workspace);
            setRecords(list);
            setRecord(detail);
            setWarehouses(warehouseRows);
            setPriceLists(priceListRows);
            setProducts(productRows);
            if (route.recordId !== null && detail) setValues(initialValues(route.resource, detail));
            else if (route.creating) setValues(initialValues(route.resource));
            setState('success');
        }

        load().catch((error: unknown) => {
            if (!mounted || (error instanceof DOMException && error.name === 'AbortError')) return;
            if (error instanceof ApiError && error.status === 403) setState('denied');
            else setState('error');
        });

        return () => { mounted = false; controller.abort(); };
    }, [attempt, route.recordId, route.resource, route.creating]);

    useEffect(() => {
        if (state === 'success' && (route.recordId !== null || route.creating)) {
            document.getElementById('page-title')?.focus({ preventScroll: true });
        }
    }, [route.creating, route.recordId, state]);

    function setValue(key: string, value: string | string[] | boolean) {
        setValues((current) => ({ ...current, [key]: value }));
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!canManage) return;
        setSaving(true);
        setMessage('');
        const payload: Record<string, unknown> = {
            code: values.code,
            [config.nameField]: values[config.nameField],
        };
        if (route.resource === 'parties') payload.roles = values.roles;
        if (route.resource === 'units') {
            payload.symbol = values.symbol;
            payload.is_active = values.is_active;
        }
        if (route.resource === 'locations') payload.warehouse_id = Number(values.warehouse_id);

        try {
            const saved = route.recordId === null
                ? await createResourceRecord(route.resource, payload)
                : await updateResourceRecord(route.resource, route.recordId, payload);
            window.location.assign(href(`/${route.resource}/${saved.id}`));
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setSaving(false);
        }
    }

    async function changeOrganization(organizationId: number) {
        setSwitching(true);
        try {
            await selectOrganization(organizationId);
            setAttempt((current) => current + 1);
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setSwitching(false);
        }
    }

    async function exitSession() {
        try { await signOut(); } catch { setMessage('خروج انجام نشد؛ دوباره تلاش کنید.'); }
    }

    const toolbar = (
        <>
            <div className="toolbar-leading">
                {route.recordId === null && !route.creating ? (
                    <GlassSearchField label={`جست‌وجو در ${config.plural}`} value={filter} placeholder="نام یا کد را بنویسید" onChange={setFilter} />
                ) : <span className="toolbar-context-label">{config.singular} · اطلاعات پایه</span>}
            </div>
            <div className="toolbar-actions">
                {canManage && route.recordId === null && !route.creating && <a className="master-toolbar-create" href={href(`/${route.resource}/new`)}>مورد جدید</a>}
                <GlassButton variant="tinted" onClick={() => setAttempt((current) => current + 1)} disabled={state === 'loading'} forceFallback={forceFallback}>
                    {state === 'loading' ? 'در حال دریافت' : 'به‌روزرسانی'}
                </GlassButton>
            </div>
        </>
    );

    if (context === null) {
        return <main className="app-shell" data-lg-role="stage"><section className="focus-content" data-lg-role="focus" aria-busy={state === 'loading'}>
            <div className="state-panel" role={state === 'error' ? 'alert' : 'status'}>
                <h2>{state === 'loading' ? 'در حال دریافت فضای کاری' : state === 'denied' ? 'دسترسی به سازمان فعال نیست' : 'اتصال به اطلاعات پایه برقرار نشد'}</h2>
                {state === 'loading' ? <p>در حال بررسی عضویت و فهرست سازمان است.</p> : <GlassButton variant="tinted" onClick={() => setAttempt((current) => current + 1)}>تلاش دوباره</GlassButton>}
            </div>
        </section></main>;
    }

    const missingRecord = route.recordId !== null && record === null;

    return (
        <WorkspaceShell
            title={title}
            eyebrow={route.recordId === null && !route.creating ? 'مدیریت اطلاعات پایه' : 'اطلاعات پایه / جزئیات'}
            subtitle={route.recordId === null && !route.creating ? `جست‌وجو و نگهداری ${config.plural} سازمان فعال` : `مشاهده یا ویرایش ${config.singular}`}
            activePage={route.recordId === null && !route.creating ? 'list' : 'detail'}
            activeResource={route.resource}
            phaseLabel="P04"
            connectionState={state === 'success' ? 'ready' : state === 'loading' ? 'loading' : 'error'}
            connectionLabel={state === 'success' ? 'اطلاعات دریافت شد' : state === 'loading' ? 'در حال دریافت داده' : 'نیاز به بررسی'}
            toolbar={toolbar}
            forceFallback={forceFallback}
            activeOrganization={context.active_organization}
            organizations={context.organizations}
            onOrganizationChange={changeOrganization}
            onSignOut={exitSession}
            organizationSwitching={switching}
        >
            {state === 'loading' ? (
                <section className="focus-content" data-lg-role="focus" aria-busy="true"><div className="state-panel" role="status"><span className="loading-mark" aria-hidden="true" /><h2>در حال دریافت اطلاعات</h2><p>فهرست سازمان فعال در حال بارگیری است.</p></div></section>
            ) : state === 'error' ? (
                <section className="focus-content" data-lg-role="focus"><div className="state-panel error-panel" role="alert"><h2>دریافت اطلاعات انجام نشد</h2><p>اتصال محلی یا داده‌های فهرست را بررسی کنید.</p><GlassButton variant="tinted" onClick={() => setAttempt((current) => current + 1)}>تلاش دوباره</GlassButton></div></section>
            ) : state === 'denied' ? (
                <section className="focus-content" data-lg-role="focus"><div className="state-panel denied-card" role="alert"><h2>دسترسی مجاز نیست</h2><p>عضویت شما در سازمان فعال باید دوباره بررسی شود.</p></div></section>
            ) : route.recordId === null && !route.creating ? (
                <>
                    <ResourceRegister resource={route.resource} records={records} filter={filter} />
                    {route.resource === 'locations' && <LocationSelectionCheck warehouses={warehouses} />}
                </>
            ) : missingRecord ? (
                <section className="focus-content" data-lg-role="focus"><div className="state-panel unknown-panel" role="status"><h2>{config.singular} پیدا نشد</h2><p>این شناسه در اطلاعات سازمان فعال وجود ندارد.</p><a className="detail-register-link" href={href(`/${route.resource}`)}>بازگشت به فهرست</a></div></section>
            ) : route.creating && !canManage ? (
                <section className="focus-content" data-lg-role="focus"><div className="state-panel denied-card" role="alert"><h2>اجازهٔ ایجاد ندارید</h2><p>ثبت اطلاعات پایه فقط برای ویرایشگر سازمان فعال در دسترس است.</p></div></section>
            ) : (
                <section className="focus-content master-detail" aria-labelledby="detail-title" data-lg-role="focus">
                    <div className="detail-topline"><a className="back-link" href={href(`/${route.resource}`)}>← بازگشت به فهرست {config.plural}</a>{record && <span className="detail-id">شناسه <bdi dir="ltr">{record.id}</bdi></span>}</div>
                    <div className="master-detail-heading"><p className="eyebrow">فرم مشترک اطلاعات پایه · {config.singular}</p><h2 id="detail-title">{route.creating ? `ثبت ${config.singular} جدید` : record ? recordName(route.resource, record) : title}</h2></div>
                    {route.creating || canManage ? (
                        <MasterDataForm resource={route.resource} values={values} setValue={setValue} warehouses={warehouses} canManage={canManage} saving={saving} message={message} onSubmit={submit} />
                    ) : (
                        <>
                            <MasterDataForm resource={route.resource} values={values} setValue={setValue} warehouses={warehouses} canManage={false} saving={false} message="" onSubmit={(event) => event.preventDefault()} />
                            <dl className="detail-fields"><div className="detail-field"><dt>کد</dt><dd><bdi dir="ltr">{record?.code}</bdi></dd></div>{route.resource === 'price-lists' && <div className="detail-field"><dt>واحد پول</dt><dd>ریال</dd></div>}</dl>
                        </>
                    )}
                    {!route.creating && route.resource === 'price-lists' && record && (
                        <PriceListTools
                            list={record as PriceListRecord}
                            lists={priceLists}
                            products={products}
                            canManage={canManage}
                            onChangeList={(id) => window.location.assign(href(`/price-lists/${id}`))}
                            onRefresh={() => setAttempt((current) => current + 1)}
                        />
                    )}
                    {!route.creating && route.resource === 'price-lists' && record && (record as PriceListRecord).entries && (
                        <div className="price-entry-list">
                            <div className="surface-heading"><div><p className="eyebrow">مبنای قیمت، واحد پایهٔ کالا است</p><h3>قیمت‌های این فهرست</h3></div><span className="rial-label">ریال</span></div>
                            {(record as PriceListRecord).entries?.length ? (record as PriceListRecord).entries?.map((entry) => (
                                <div className="price-entry-row" key={entry.product.id}>
                                    <span>{entry.product.name}<small>{entry.product.base_unit ? ` · ${entry.product.base_unit.name}` : ' · واحد پایه نامشخص'}</small></span>
                                    <bdi dir="auto">{formatRials(entry.amount_rial)}</bdi>
                                </div>
                            )) : <p className="master-readonly-note">هنوز قیمتی در این فهرست ثبت نشده است.</p>}
                        </div>
                    )}
                    <p className="edit-result" role="status" aria-live="polite">{message}</p>
                </section>
            )}
        </WorkspaceShell>
    );
}
