import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
    createStockReservation,
    fetchStockBalances,
    fetchStockMovements,
    fetchStockOptions,
    fetchStockReservations,
    postStockOperation,
    releaseStockReservation,
    StockApiError,
    type StockBalance,
    type StockOperation,
    type StockOperationInput,
    type StockOperationType,
    type StockOptions,
    type StockReservation,
    type StockReservationInput,
    type StockWarehouse,
} from '../api/stock';
import { fetchWorkspaceContext, selectOrganization, signOut, type WorkspaceContext } from '../api/products';
import { GlassButton } from '../components/GlassButton';
import { LabeledInput } from '../components/LabeledInput';
import { LiquidGlass } from '../liquid-glass/LiquidGlass.jsx';
import { WorkspaceShell } from '../components/WorkspaceShell';

type Resource = 'stock' | 'stock-movements' | 'stock-reservations';
type LoadState = 'loading' | 'success' | 'error' | 'denied';
type RetryKey = { signature: string; value: string } | null;

const meta: Record<Resource, { title: string; subtitle: string; endpoint: string }> = {
    stock: { title: 'ماندهٔ موجودی', subtitle: 'موجودی فیزیکی، رزروشده و قابل‌دسترس به تفکیک کالا و مکان', endpoint: 'balances' },
    'stock-movements': { title: 'گردش موجودی', subtitle: 'دفتر تغییرناپذیر رسید، حواله، افتتاحیه و انتقال مکان', endpoint: 'movements' },
    'stock-reservations': { title: 'رزروهای موجودی', subtitle: 'رزروهای باز و تاریخچهٔ آزادسازی در سازمان فعال', endpoint: 'reservations' },
};

const operationLabels: Record<StockOperationType, string> = {
    opening: 'موجودی افتتاحیه',
    receipt: 'رسید',
    issue: 'حواله',
    transfer: 'انتقال مکان',
};

function currentResource(): Resource {
    const path = window.location.pathname.replace(/\/+$/, '');
    if (path === '/stock/movements') return 'stock-movements';
    if (path === '/stock/reservations') return 'stock-reservations';
    return 'stock';
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

function formatQuantity(value: string): string {
    const [whole = '0', fractional = '000'] = value.split('.', 2);
    const formattedWhole = new Intl.NumberFormat('fa-IR').format(BigInt(whole || '0'));
    const digits = fractional.padEnd(3, '0').slice(0, 3).replace(/[0-9]/g, (digit) => String.fromCharCode(0x06f0 + Number(digit)));

    return `${formattedWhole}٫${digits}`;
}

function formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function requestKey(previous: RetryKey, payload: unknown): NonNullable<RetryKey> {
    const signature = JSON.stringify(payload);
    return previous?.signature === signature ? previous : { signature, value: crypto.randomUUID() };
}

function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
    return <section className="focus-content" data-lg-role="focus"><div className="state-panel error-panel" role="alert"><h2>{title}</h2><p>{message}</p><GlassButton variant="tinted" onClick={onRetry}>تلاش دوباره</GlassButton></div></section>;
}

function EmptyState({ title, children }: { title: string; children: ReactNode }) {
    return <div className="state-panel" role="status"><span className="state-icon empty-icon" aria-hidden="true">—</span><h2>{title}</h2><p>{children}</p></div>;
}

function StockPanel({ children, className, role, forceFallback }: {
    children: ReactNode;
    className: string;
    role: 'focus' | 'rail';
    forceFallback: boolean;
}) {
    return <LiquidGlass className={`stock-panel ${className}`} variant="regular" radius={20} profile="soft" strength={105} magnify={1.03} dispersion={0.006} blur={0.3} forceFallback={forceFallback} data-lg-role={role}>{children}</LiquidGlass>;
}

function ProductSelect({ id, label, options, value, onChange }: {
    id: string;
    label: string;
    options: StockOptions;
    value: string;
    onChange: (value: string) => void;
}) {
    const usableProducts = options.products.filter((product) => product.base_unit !== null);
    return (
        <label className="stock-field" htmlFor={id}>
            <span>{label}</span>
            <select id={id} value={value} onChange={(event) => onChange(event.currentTarget.value)} required disabled={usableProducts.length === 0}>
                <option value="">انتخاب کالا</option>
                {usableProducts.map((product) => <option key={product.id} value={product.id}>{product.code} · {product.name} ({product.base_unit?.symbol})</option>)}
            </select>
            {usableProducts.length === 0 && <small>کالایی با واحد پایهٔ مشخص‌شده پیدا نشد.</small>}
        </label>
    );
}

function WarehouseLocationFields({
    idPrefix, warehouses, warehouseId, locationId, onWarehouseChange, onLocationChange, label,
}: {
    idPrefix: string;
    warehouses: StockWarehouse[];
    warehouseId: string;
    locationId: string;
    onWarehouseChange: (value: string) => void;
    onLocationChange: (value: string) => void;
    label: string;
}) {
    const warehouse = warehouses.find((item) => String(item.id) === warehouseId);
    return (
        <fieldset className="stock-location-fields">
            <legend>{label}</legend>
            <label className="stock-field" htmlFor={`${idPrefix}-warehouse`}>
                <span>انبار</span>
                <select id={`${idPrefix}-warehouse`} value={warehouseId} onChange={(event) => { onWarehouseChange(event.currentTarget.value); onLocationChange(''); }} required>
                    <option value="">انتخاب انبار</option>
                    {warehouses.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
                </select>
            </label>
            <label className="stock-field" htmlFor={`${idPrefix}-location`}>
                <span>مکان</span>
                <select id={`${idPrefix}-location`} value={locationId} onChange={(event) => onLocationChange(event.currentTarget.value)} required disabled={!warehouse}>
                    <option value="">انتخاب مکان</option>
                    {(warehouse?.locations ?? []).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
                </select>
                {warehouse && warehouse.locations.length === 0 && <small>برای این انبار مکانی ثبت نشده است.</small>}
            </label>
        </fieldset>
    );
}

function OperationForm({
    options, forceFallback, onSubmit, message, busy,
}: {
    options: StockOptions;
    forceFallback: boolean;
    onSubmit: (input: StockOperationInput) => Promise<boolean>;
    message: string;
    busy: boolean;
}) {
    const [type, setType] = useState<StockOperationType>('opening');
    const [productId, setProductId] = useState('');
    const [quantity, setQuantity] = useState('');
    const [warehouseId, setWarehouseId] = useState('');
    const [locationId, setLocationId] = useState('');
    const [destinationWarehouseId, setDestinationWarehouseId] = useState('');
    const [destinationLocationId, setDestinationLocationId] = useState('');

    useEffect(() => {
        if (!productId) setProductId(String(options.products.find((item) => item.base_unit !== null)?.id ?? ''));
        if (!warehouseId) setWarehouseId(String(options.warehouses[0]?.id ?? ''));
    }, [options, productId, warehouseId]);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const input: StockOperationInput = {
            operation_type: type,
            product_id: Number(productId),
            quantity: quantity.trim(),
            warehouse_id: Number(warehouseId),
            location_id: Number(locationId),
            ...(type === 'transfer' ? {
                destination_warehouse_id: Number(destinationWarehouseId),
                destination_location_id: Number(destinationLocationId),
            } : {}),
        };
        if (await onSubmit(input)) setQuantity('');
    }

    const locationLabel = type === 'issue' || type === 'transfer' ? 'مبدأ' : 'مکان مقصد';
    return (
        <form className="stock-form" onSubmit={submit} aria-label="ثبت عملیات موجودی">
            <label className="stock-field" htmlFor="stock-operation-type">
                <span>نوع عملیات</span>
                <select id="stock-operation-type" value={type} onChange={(event) => setType(event.currentTarget.value as StockOperationType)}>
                    {(Object.keys(operationLabels) as StockOperationType[]).map((key) => <option key={key} value={key}>{operationLabels[key]}</option>)}
                </select>
            </label>
            <ProductSelect id="stock-operation-product" label="کالا و واحد پایه" options={options} value={productId} onChange={setProductId} />
            <LabeledInput id="stock-operation-quantity" label="مقدار (حداکثر سه رقم اعشار)" value={quantity} onChange={setQuantity} required direction="ltr" placeholder="مثلاً 10.000" />
            <WarehouseLocationFields idPrefix="stock-source" label={locationLabel} warehouses={options.warehouses} warehouseId={warehouseId} locationId={locationId} onWarehouseChange={setWarehouseId} onLocationChange={setLocationId} />
            {type === 'transfer' && <WarehouseLocationFields idPrefix="stock-destination" label="مقصد" warehouses={options.warehouses} warehouseId={destinationWarehouseId} locationId={destinationLocationId} onWarehouseChange={setDestinationWarehouseId} onLocationChange={setDestinationLocationId} />}
            <p className="stock-form-note">مقدار به واحد پایه ذخیره می‌شود. ثبت انجام‌شده در دفتر تاریخچه ویرایش یا حذف نمی‌شود.</p>
            {message && <p className="stock-feedback" role="status">{message}</p>}
            <GlassButton type="submit" variant="tinted" disabled={busy || options.products.every((item) => item.base_unit === null)} forceFallback={forceFallback}>
                {busy ? 'در حال ثبت…' : 'ثبت عملیات'}
            </GlassButton>
        </form>
    );
}

function ReservationForm({ options, forceFallback, onSubmit, message, busy }: {
    options: StockOptions;
    forceFallback: boolean;
    onSubmit: (input: StockReservationInput) => Promise<boolean>;
    message: string;
    busy: boolean;
}) {
    const [productId, setProductId] = useState('');
    const [quantity, setQuantity] = useState('');
    const [warehouseId, setWarehouseId] = useState('');
    const [locationId, setLocationId] = useState('');
    useEffect(() => {
        if (!productId) setProductId(String(options.products.find((item) => item.base_unit !== null)?.id ?? ''));
        if (!warehouseId) setWarehouseId(String(options.warehouses[0]?.id ?? ''));
    }, [options, productId, warehouseId]);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (await onSubmit({ product_id: Number(productId), quantity: quantity.trim(), warehouse_id: Number(warehouseId), location_id: Number(locationId) })) setQuantity('');
    }

    return (
        <form className="stock-form" onSubmit={submit} aria-label="ایجاد رزرو موجودی">
            <ProductSelect id="stock-reservation-product" label="کالا و واحد پایه" options={options} value={productId} onChange={setProductId} />
            <LabeledInput id="stock-reservation-quantity" label="مقدار رزرو (حداکثر سه رقم اعشار)" value={quantity} onChange={setQuantity} required direction="ltr" placeholder="مثلاً 3.000" />
            <WarehouseLocationFields idPrefix="stock-reservation" label="مکان رزرو" warehouses={options.warehouses} warehouseId={warehouseId} locationId={locationId} onWarehouseChange={setWarehouseId} onLocationChange={setLocationId} />
            <p className="stock-form-note">رزرو، مقدار فیزیکی را تغییر نمی‌دهد و فقط از موجودی قابل‌دسترس کم می‌کند.</p>
            {message && <p className="stock-feedback" role="status">{message}</p>}
            <GlassButton type="submit" variant="tinted" disabled={busy || options.products.every((item) => item.base_unit === null)} forceFallback={forceFallback}>
                {busy ? 'در حال رزرو…' : 'ثبت رزرو'}
            </GlassButton>
        </form>
    );
}

function BalancesTable({ balances, filter, onFilterChange }: { balances: StockBalance[]; filter: string; onFilterChange: (value: string) => void }) {
    const rows = useMemo(() => {
        const needle = filter.trim().toLocaleLowerCase();
        if (!needle) return balances;
        return balances.filter((item) => `${item.product.code} ${item.product.name} ${item.location.warehouse.code} ${item.location.warehouse.name} ${item.location.code} ${item.location.name}`.toLocaleLowerCase().includes(needle));
    }, [balances, filter]);

    return (
        <>
            <label className="stock-search" htmlFor="stock-balance-search"><span>جست‌وجوی کالا یا مکان</span><input id="stock-balance-search" type="search" value={filter} onChange={(event) => onFilterChange(event.currentTarget.value)} /></label>
            {rows.length === 0 ? <EmptyState title={balances.length ? 'نتیجه‌ای پیدا نشد' : 'هنوز حرکتی ثبت نشده است'}>{balances.length ? 'عبارت جست‌وجو را تغییر دهید.' : 'برای ساخت تراز نخست، یک موجودی افتتاحیه ثبت کنید.'}</EmptyState> : (
                <div className="stock-table-wrap"><table className="stock-table" aria-label="ماندهٔ موجودی کالاها">
                    <thead><tr><th scope="col">کالا</th><th scope="col">مکان</th><th scope="col">فیزیکی</th><th scope="col">رزروشده</th><th scope="col">قابل‌دسترس</th></tr></thead>
                    <tbody>{rows.map((item) => <tr key={`${item.product.id}-${item.location.id}`}>
                        <td data-label="کالا"><strong>{item.product.name}</strong><small><bdi dir="ltr">{item.product.code}</bdi> · {item.base_unit.symbol}</small></td>
                        <td data-label="مکان"><strong>{item.location.name}</strong><small>{item.location.warehouse.name} · <bdi dir="ltr">{item.location.code}</bdi></small></td>
                        <td data-label="فیزیکی"><bdi dir="ltr">{formatQuantity(item.physical_quantity)}</bdi></td>
                        <td data-label="رزروشده"><bdi dir="ltr">{formatQuantity(item.reserved_quantity)}</bdi></td>
                        <td data-label="قابل‌دسترس"><strong className="stock-available"><bdi dir="ltr">{formatQuantity(item.available_quantity)}</bdi></strong></td>
                    </tr>)}</tbody>
                </table></div>
            )}
        </>
    );
}

function MovementsTable({ rows }: { rows: StockOperation[] }) {
    if (rows.length === 0) return <EmptyState title="دفتر حرکت خالی است">رسید، حواله، انتقال یا موجودی افتتاحیه در این سازمان ثبت نشده است.</EmptyState>;
    return <div className="stock-table-wrap"><table className="stock-table stock-history-table" aria-label="تاریخچهٔ عملیات موجودی">
        <thead><tr><th scope="col">عملیات</th><th scope="col">کالا</th><th scope="col">مقدار</th><th scope="col">مسیر</th><th scope="col">ثبت‌کننده و زمان</th></tr></thead>
        <tbody>{rows.map((item) => <tr key={item.id}>
            <td data-label="عملیات"><strong>{operationLabels[item.operation_type]}</strong><small><bdi dir="ltr">{item.reference}</bdi></small></td>
            <td data-label="کالا"><strong>{item.product.name}</strong><small><bdi dir="ltr">{item.product.code}</bdi></small></td>
            <td data-label="مقدار"><bdi dir="ltr">{formatQuantity(item.quantity)}</bdi> {item.base_unit.symbol}</td>
            <td data-label="مسیر"><strong>{item.operation_type === 'transfer'
                ? `از ${item.from_location?.name ?? '—'} به ${item.to_location?.name ?? '—'}`
                : item.from_location ? `از ${item.from_location.name}` : `به ${item.to_location?.name ?? '—'}`}</strong>
                {item.operation_type === 'transfer' && <small>{item.legs.length} حرکت مرتبط با همین عملیات</small>}
            </td>
            <td data-label="ثبت‌کننده و زمان"><strong>{item.actor.name ?? 'کاربر'}</strong><small>{formatDate(item.created_at)}</small></td>
        </tr>)}</tbody>
    </table></div>;
}

function ReservationsTable({ rows, canManage, releasing, onRelease }: {
    rows: StockReservation[];
    canManage: boolean;
    releasing: number | null;
    onRelease: (id: number) => Promise<void>;
}) {
    if (rows.length === 0) return <EmptyState title="رزروی ثبت نشده است">رزروهای موجودی به مکان و واحد پایهٔ مشخص وابسته‌اند.</EmptyState>;
    return <div className="stock-table-wrap"><table className="stock-table stock-reservation-table" aria-label="رزروهای موجودی">
        <thead><tr><th scope="col">کالا و مکان</th><th scope="col">مقدار</th><th scope="col">وضعیت</th><th scope="col">زمان و اقدام</th></tr></thead>
        <tbody>{rows.map((item) => <tr key={item.id}>
            <td data-label="کالا و مکان"><strong>{item.product.name}</strong><small><bdi dir="ltr">{item.product.code}</bdi> · {item.location.name}</small></td>
            <td data-label="مقدار"><bdi dir="ltr">{formatQuantity(item.quantity)}</bdi> {item.base_unit.symbol}</td>
            <td data-label="وضعیت"><span className={`stock-status stock-status-${item.status}`}>{item.status === 'open' ? 'باز' : 'آزادشده'}</span></td>
            <td data-label="زمان و اقدام"><strong>{item.created_by.name ?? 'کاربر'} · {formatDate(item.created_at)}</strong>
                {item.status === 'open' && canManage ? <button className="stock-release-button" type="button" onClick={() => void onRelease(item.id)} disabled={releasing === item.id}>{releasing === item.id ? 'در حال آزادسازی…' : 'آزادسازی رزرو'}</button> : item.released_at ? <small>آزاد شد: {formatDate(item.released_at)}</small> : null}
            </td>
        </tr>)}</tbody>
    </table></div>;
}

export function StockScreen() {
    const resource = currentResource();
    const [context, setContext] = useState<WorkspaceContext | null>(null);
    const [options, setOptions] = useState<StockOptions>({ products: [], warehouses: [] });
    const [balances, setBalances] = useState<StockBalance[]>([]);
    const [movements, setMovements] = useState<StockOperation[]>([]);
    const [reservations, setReservations] = useState<StockReservation[]>([]);
    const [state, setState] = useState<LoadState>('loading');
    const [errorMessage, setErrorMessage] = useState('');
    const [message, setMessage] = useState('');
    const [attempt, setAttempt] = useState(0);
    const [filter, setFilter] = useState('');
    const [busy, setBusy] = useState(false);
    const [releasing, setReleasing] = useState<number | null>(null);
    const [switching, setSwitching] = useState(false);
    const operationRetry = useRef<RetryKey>(null);
    const reservationRetry = useRef<RetryKey>(null);
    const forceFallback = new URLSearchParams(window.location.search).get('glass') === 'fallback';

    useEffect(() => {
        const controller = new AbortController();
        setState('loading');
        async function load() {
            try {
                const [workspace, stockOptions, balanceRows, movementRows, reservationRows] = await Promise.all([
                    fetchWorkspaceContext(controller.signal),
                    fetchStockOptions(controller.signal),
                    fetchStockBalances(controller.signal),
                    fetchStockMovements(controller.signal),
                    fetchStockReservations(controller.signal),
                ]);
                setContext(workspace);
                setOptions(stockOptions);
                setBalances(balanceRows);
                setMovements(movementRows);
                setReservations(reservationRows);
                setErrorMessage('');
                setState('success');
            } catch (error) {
                if (controller.signal.aborted) return;
                if (error instanceof StockApiError && (error.status === 401 || error.status === 403)) {
                    setState('denied');
                    setErrorMessage(error.message);
                } else {
                    setState('error');
                    setErrorMessage(error instanceof Error ? error.message : 'اتصال محلی را بررسی کنید.');
                }
            }
        }
        void load();
        return () => controller.abort();
    }, [attempt]);

    async function changeOrganization(organizationId: number) {
        setSwitching(true);
        setMessage('');
        try {
            await selectOrganization(organizationId);
            setAttempt((value) => value + 1);
        } catch {
            setErrorMessage('تغییر سازمان انجام نشد؛ دوباره تلاش کنید.');
        } finally {
            setSwitching(false);
        }
    }

    async function submitOperation(input: StockOperationInput): Promise<boolean> {
        const key = requestKey(operationRetry.current, input);
        operationRetry.current = key;
        setBusy(true);
        setMessage('');
        try {
            await postStockOperation(input, key.value);
            operationRetry.current = null;
            setMessage('عملیات در دفتر موجودی ثبت شد.');
            setAttempt((value) => value + 1);
            return true;
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'ثبت عملیات انجام نشد.');
            return false;
        } finally {
            setBusy(false);
        }
    }

    async function submitReservation(input: StockReservationInput): Promise<boolean> {
        const key = requestKey(reservationRetry.current, input);
        reservationRetry.current = key;
        setBusy(true);
        setMessage('');
        try {
            await createStockReservation(input, key.value);
            reservationRetry.current = null;
            setMessage('رزرو در مکان انتخاب‌شده ثبت شد.');
            setAttempt((value) => value + 1);
            return true;
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'ثبت رزرو انجام نشد.');
            return false;
        } finally {
            setBusy(false);
        }
    }

    async function releaseReservation(id: number) {
        setReleasing(id);
        setMessage('');
        try {
            const result = await releaseStockReservation(id);
            setMessage(`رزرو ${result.status === 'released' ? 'آزاد شد' : 'به‌روزرسانی شد'}.`);
            setAttempt((value) => value + 1);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'آزادسازی رزرو انجام نشد.');
        } finally {
            setReleasing(null);
        }
    }

    async function exitSession() {
        try { await signOut(); } catch { setErrorMessage('خروج انجام نشد؛ دوباره تلاش کنید.'); }
    }

    const canManage = context?.active_organization.role === 'editor';
    const toolbar = <div className="stock-toolbar"><span className="stock-record-count">{resource === 'stock' ? `${balances.length} کلید موجودی` : resource === 'stock-movements' ? `${movements.length} عملیات ثبت‌شده` : `${reservations.length} رزرو`}</span><GlassButton variant="regular" disabled={state === 'loading'} forceFallback={forceFallback} onClick={() => setAttempt((value) => value + 1)}>به‌روزرسانی</GlassButton></div>;

    let content: ReactNode;
    if (state === 'loading' || context === null) {
        content = <section className="focus-content" data-lg-role="focus" aria-busy="true"><div className="state-panel" role="status"><span className="loading-mark" aria-hidden="true" /><h2>در حال دریافت موجودی</h2><p>ترازها از دفتر حرکت و رزروهای باز محاسبه می‌شوند.</p></div></section>;
    } else if (state === 'denied') {
        content = <section className="focus-content" data-lg-role="focus"><div className="state-panel denied-card" role="alert"><h2>دسترسی مجاز نیست</h2><p>{errorMessage || 'عضویت سازمان فعال را بررسی کنید.'}</p></div></section>;
    } else if (state === 'error') {
        content = <ErrorState title="دریافت اطلاعات انجام نشد" message={errorMessage || 'اتصال محلی را بررسی کنید.'} onRetry={() => setAttempt((value) => value + 1)} />;
    } else if (resource === 'stock') {
        content = <section className="stock-layout">
            <StockPanel className="stock-balance-panel" role="focus" forceFallback={forceFallback}>
                <header className="stock-panel-heading"><div><p className="eyebrow">تراز سازمانی</p><h2>مانده به تفکیک مکان</h2></div><span className="stock-unit-hint">مقادیر برحسب واحد پایه</span></header>
                <BalancesTable balances={balances} filter={filter} onFilterChange={setFilter} />
            </StockPanel>
            {canManage ? <StockPanel className="stock-entry-panel" role="rail" forceFallback={forceFallback}><header className="stock-panel-heading"><div><p className="eyebrow">ثبت دفتر</p><h2>عملیات موجودی</h2></div></header><OperationForm options={options} forceFallback={forceFallback} onSubmit={submitOperation} message={message} busy={busy} /></StockPanel> : <StockPanel className="stock-reader-note" role="rail" forceFallback={forceFallback}><p className="eyebrow">دسترسی خواندن</p><h2>نمایش سازمان فعال</h2><p>نقش فقط‌خواندنی می‌تواند ترازها و تاریخچه را ببیند؛ ثبت عملیات برای ویرایشگر سازمان فعال است.</p></StockPanel>}
        </section>;
    } else if (resource === 'stock-movements') {
        content = <StockPanel className="stock-history-panel" role="focus" forceFallback={forceFallback}><header className="stock-panel-heading"><div><p className="eyebrow">ثبت‌های تغییرناپذیر</p><h2>عملیات و دو سوی انتقال</h2></div><span className="stock-unit-hint">هر انتقال یک شناسه و دو حرکت دارد</span></header><MovementsTable rows={movements} /></StockPanel>;
    } else {
        content = <section className="stock-layout">
            <StockPanel className="stock-history-panel" role="focus" forceFallback={forceFallback}><header className="stock-panel-heading"><div><p className="eyebrow">رزروهای مکان‌محور</p><h2>وضعیت و آزادسازی</h2></div></header><ReservationsTable rows={reservations} canManage={canManage} releasing={releasing} onRelease={releaseReservation} />{message && <p className="stock-feedback" role="status">{message}</p>}</StockPanel>
            {canManage ? <StockPanel className="stock-entry-panel" role="rail" forceFallback={forceFallback}><header className="stock-panel-heading"><div><p className="eyebrow">کاهش موجودی قابل‌دسترس</p><h2>رزرو جدید</h2></div></header><ReservationForm options={options} forceFallback={forceFallback} onSubmit={submitReservation} message={message} busy={busy} /></StockPanel> : <StockPanel className="stock-reader-note" role="rail" forceFallback={forceFallback}><p className="eyebrow">دسترسی خواندن</p><h2>رزروها</h2><p>فقط ویرایشگر می‌تواند رزرو بسازد یا آزاد کند.</p></StockPanel>}
        </section>;
    }

    if (context === null) return <main className="app-shell" data-lg-role="stage">{content}</main>;

    return <WorkspaceShell title={meta[resource].title} eyebrow="کنترل موجودی" subtitle={meta[resource].subtitle} activePage="list" activeResource={resource} phaseLabel="P06"
        connectionState={state === 'error' || state === 'denied' ? 'error' : state === 'loading' ? 'loading' : 'ready'}
        connectionLabel={state === 'success' ? 'تراز موجودی آماده است' : state === 'loading' ? 'در حال دریافت تراز' : 'نیاز به بررسی'} toolbar={toolbar}
        forceFallback={forceFallback} activeOrganization={context.active_organization} organizations={context.organizations} onOrganizationChange={changeOrganization}
        onSignOut={exitSession} organizationSwitching={switching}>{content}</WorkspaceShell>;
}
