import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
    approvePurchaseRequest,
    convertPurchaseRequest,
    createPurchaseRequest,
    fetchPurchaseOrder,
    fetchPurchaseOrders,
    fetchPurchaseRequest,
    fetchPurchaseRequests,
    fetchPurchasesOptions,
    PurchaseApiError,
    receivePurchaseOrderLine,
    submitPurchaseRequest,
    type PurchaseOrderLine,
    type PurchaseOrderRecord,
    type PurchaseRequestRecord,
    type PurchasesOptions,
} from '../api/purchases';
import { fetchWorkspaceContext, selectOrganization, signOut, type WorkspaceContext } from '../api/products';
import { GlassButton } from '../components/GlassButton';
import { GlassSearchField } from '../components/GlassSearchField';
import { WorkspaceShell } from '../components/WorkspaceShell';

type Resource = 'purchase-requests' | 'purchase-orders';
type LoadState = 'loading' | 'ready' | 'error' | 'denied';
type DraftLine = { productId: string; quantity: string };
type RetryKey = { signature: string; value: string } | null;
type ReceiptFields = { warehouseId: string; locationId: string; quantity: string };

const statusLabels: Record<PurchaseRequestRecord['status'], string> = {
    draft: 'پیش‌نویس',
    submitted: 'در انتظار تأیید',
    approved: 'تأییدشده',
};

function currentRoute(): { resource: Resource; id: number | null } {
    const [resource, record] = window.location.pathname.replace(/\/+$/, '').split('/').slice(1);
    return {
        resource: resource === 'purchase-orders' ? 'purchase-orders' : 'purchase-requests',
        id: record && /^\d+$/.test(record) ? Number(record) : null,
    };
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

function formatMoney(value: string): string {
    try {
        return new Intl.NumberFormat('fa-IR').format(BigInt(value));
    } catch {
        return value;
    }
}

function quantityMilli(value: string): bigint {
    const [whole = '0', fraction = ''] = value.split('.', 2);
    return BigInt(whole || '0') * 1000n + BigInt(fraction.padEnd(3, '0').slice(0, 3));
}

function formatQuantity(value: string): string {
    const [whole = '0', fraction = '000'] = value.split('.', 2);
    const digits = fraction.padEnd(3, '0').slice(0, 3).replace(/[0-9]/g, (digit) => String.fromCharCode(0x06f0 + Number(digit)));
    return `${new Intl.NumberFormat('fa-IR').format(BigInt(whole || '0'))}٫${digits}`;
}

function formatDate(value: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function nextRetryKey(previous: RetryKey, payload: unknown): NonNullable<RetryKey> {
    const signature = JSON.stringify(payload);
    return previous?.signature === signature ? previous : { signature, value: crypto.randomUUID() };
}

function Empty({ title, children }: { title: string; children: ReactNode }) {
    return <div className="purchase-empty" role="status"><h3>{title}</h3><p>{children}</p></div>;
}

function Feedback({ message }: { message: string }) {
    return message ? <p className="purchase-feedback" role="alert">{message}</p> : null;
}

function Status({ label, kind }: { label: string; kind: string }) {
    return <span className={`purchase-state state-${kind}`}>{label}</span>;
}

function Panel({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
    return (
        <section className="purchase-panel">
            <header className="purchase-panel-heading"><div><h2>{title}</h2>{note && <p className="purchase-muted">{note}</p>}</div></header>
            {children}
        </section>
    );
}

function PurchaseRequestForm({
    options, busy, fallback, onCreate,
}: {
    options: PurchasesOptions;
    busy: boolean;
    fallback: boolean;
    onCreate: (title: string, lines: DraftLine[]) => Promise<void>;
}) {
    const [title, setTitle] = useState('');
    const [lines, setLines] = useState<DraftLine[]>([{ productId: '', quantity: '1.000' }]);
    const [message, setMessage] = useState('');
    const products = options.products;

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setMessage('');
        if (lines.some((line) => !line.productId || !line.quantity.trim())) {
            setMessage('برای هر سطر کالا و مقدار را کامل کنید.');
            return;
        }
        try {
            await onCreate(title, lines);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'ساخت پیش‌نویس انجام نشد.');
        }
    }

    return (
        <Panel title="درخواست خرید تازه" note="سطرها برحسب واحد پایهٔ ثبت‌شدهٔ هر کالا ذخیره می‌شوند.">
            <form className="purchase-form" onSubmit={(event) => void submit(event)} data-testid="purchase-request-create-form" aria-label="ساخت درخواست خرید">
                <label className="purchase-field" htmlFor="purchase-request-title">
                    <span>عنوان درخواست</span>
                    <input id="purchase-request-title" value={title} onChange={(event) => setTitle(event.currentTarget.value)} maxLength={200} required />
                </label>
                <div className="purchase-line-list">
                    {lines.map((line, index) => (
                        <article className="purchase-line-card" key={index}>
                            <div className="purchase-line-heading"><h3>سطر {formatMoney(String(index + 1))}</h3>{lines.length > 1 && <GlassButton type="button" onClick={() => setLines((current) => current.filter((_, row) => row !== index))} aria-label={`حذف سطر ${index + 1}`} forceFallback={fallback}>حذف</GlassButton>}</div>
                            <div className="purchase-grid">
                                <label className="purchase-field" htmlFor={`purchase-request-line-product-${index}`}>
                                    <span>کالا و واحد پایه</span>
                                    <select id={`purchase-request-line-product-${index}`} data-testid={`purchase-request-line-product-${index}`} value={line.productId} onChange={(event) => { const productId = event.currentTarget.value; setLines((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, productId } : row)); }} required>
                                        <option value="">انتخاب کالا</option>
                                        {products.map((product) => <option key={product.id} value={product.id}>{product.code} · {product.name} ({product.base_unit.symbol})</option>)}
                                    </select>
                                </label>
                                <label className="purchase-field" htmlFor={`purchase-request-line-quantity-${index}`}>
                                    <span>مقدار درخواستی</span>
                                    <input id={`purchase-request-line-quantity-${index}`} data-testid={`purchase-request-line-quantity-${index}`} dir="ltr" inputMode="decimal" value={line.quantity} onChange={(event) => { const quantity = event.currentTarget.value; setLines((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, quantity } : row)); }} required />
                                </label>
                            </div>
                        </article>
                    ))}
                </div>
                <div className="purchase-action-row">
                    <GlassButton type="button" className="purchase-add-line" onClick={() => setLines((current) => [...current, { productId: '', quantity: '1.000' }])} forceFallback={fallback}>افزودن سطر</GlassButton>
                    <GlassButton type="submit" variant="tinted" disabled={busy || products.length === 0} forceFallback={fallback}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ پیش‌نویس'}</GlassButton>
                </div>
                {products.length === 0 && <p className="purchase-note">برای درخواست خرید، ابتدا کالایی با واحد پایهٔ فعال آماده کنید.</p>}
                <Feedback message={message} />
            </form>
        </Panel>
    );
}

function RequestList({
    requests, options, canManage, busyId, fallback, filter, onFilterChange, onSubmit,
}: {
    requests: PurchaseRequestRecord[];
    options: PurchasesOptions | null;
    canManage: boolean;
    busyId: number | null;
    fallback: boolean;
    filter: string;
    onFilterChange: (value: string) => void;
    onSubmit: (id: number) => Promise<void>;
}) {
    const needle = filter.trim().toLocaleLowerCase();
    const rows = useMemo(() => requests.filter((item) => `${item.code} ${item.title} ${item.requester.name ?? ''}`.toLocaleLowerCase().includes(needle)), [needle, requests]);

    return (
        <Panel title="درخواست‌های سازمان فعال" note="درخواست‌ها و سطرهای هر سند در تاریخچه باقی می‌مانند.">
            <GlassSearchField label="جست‌وجو در درخواست‌های خرید" value={filter} placeholder="کد، عنوان یا درخواست‌دهنده" onChange={onFilterChange} />
            <div className="purchase-record-list" aria-live="polite">
                {rows.length ? rows.map((item) => (
                    <article className="purchase-record" key={item.id}>
                        <div className="purchase-record-heading">
                            <div><p className="eyebrow"><bdi dir="ltr">{item.code}</bdi></p><h3><a className="purchase-document-link" href={href(`/purchase-requests/${item.id}`)}>{item.title}</a></h3></div>
                            <Status kind={item.status === 'approved' ? 'complete' : item.status === 'submitted' ? 'pending' : 'draft'} label={statusLabels[item.status]} />
                        </div>
                        <div className="purchase-record-meta"><span>درخواست‌دهنده: {item.requester.name ?? '—'}</span><span>{formatMoney(String(item.lines.length))} سطر</span><span>ثبت: {formatDate(item.created_at)}</span></div>
                        {item.purchase_order && <p className="purchase-link-row">سفارش مرتبط: <a href={href(`/purchase-orders/${item.purchase_order.id}`)}><bdi dir="ltr">{item.purchase_order.code}</bdi></a></p>}
                        {canManage && item.status === 'draft' && <div className="purchase-action-row"><GlassButton variant="tinted" disabled={busyId === item.id} onClick={() => void onSubmit(item.id)} forceFallback={fallback}>{busyId === item.id ? 'در حال ارسال…' : 'ارسال برای تأیید'}</GlassButton></div>}
                    </article>
                )) : <Empty title={needle ? 'درخواستی پیدا نشد' : 'هنوز درخواستی ثبت نشده است'}>یک پیش‌نویس با دست‌کم یک سطر کالا بسازید.</Empty>}
            </div>
            {options && !canManage && <p className="purchase-note">نقش فقط‌خواندنی امکان مشاهدهٔ درخواست‌ها را دارد.</p>}
        </Panel>
    );
}

function RequestDetail({
    request, options, canManage, busy, fallback, message, prices, setPrices, supplierId, setSupplierId, onSubmit, onApprove, onConvert,
}: {
    request: PurchaseRequestRecord;
    options: PurchasesOptions | null;
    canManage: boolean;
    busy: string;
    fallback: boolean;
    message: string;
    prices: Record<number, string>;
    setPrices: (value: Record<number, string>) => void;
    supplierId: string;
    setSupplierId: (value: string) => void;
    onSubmit: () => Promise<void>;
    onApprove: () => Promise<void>;
    onConvert: () => Promise<void>;
}) {
    const isRequester = options?.current_user_id === request.requester.id;
    const canApprove = canManage && !isRequester;
    return (
        <section className="focus-content purchase-focus" data-lg-role="focus" data-testid={`purchase-request-detail-${request.id}`}>
            <Panel title={request.title} note={`درخواست <${request.code}>`}>
                <div className="purchase-record-heading"><div><p className="eyebrow">درخواست خرید · <bdi dir="ltr">{request.code}</bdi></p><h2>{request.title}</h2></div><Status kind={request.status === 'approved' ? 'complete' : request.status === 'submitted' ? 'pending' : 'draft'} label={statusLabels[request.status]} /></div>
                <div className="purchase-record-meta"><span>درخواست‌دهنده: {request.requester.name ?? '—'}</span><span>ارسال: {formatDate(request.submitted_at)}</span><span>تأیید: {formatDate(request.approved_at)}</span></div>
                {request.approved_by && <p className="purchase-muted">تأییدکننده: {request.approved_by}</p>}
                <div className="purchase-line-list">
                    {request.lines.map((line) => <article className="purchase-line-card" key={line.id}>
                        <div className="purchase-line-heading"><h3>{line.product_name}</h3><bdi dir="ltr">{line.product_code}</bdi></div>
                        <div className="purchase-quantity-row"><span>درخواستی: <bdi dir="ltr">{formatQuantity(line.quantity)}</bdi></span><span>واحد: {line.unit.name} · <bdi dir="ltr">{line.unit.symbol}</bdi></span></div>
                    </article>)}
                </div>
                <div className="purchase-action-row">
                    {canManage && request.status === 'draft' && <GlassButton data-testid="purchase-request-submit" variant="tinted" disabled={busy === 'submit'} onClick={() => void onSubmit()} forceFallback={fallback}>{busy === 'submit' ? 'در حال ارسال…' : 'ارسال برای تأیید'}</GlassButton>}
                    {canApprove && request.status === 'submitted' && <GlassButton data-testid="purchase-request-approve" variant="tinted" disabled={busy === 'approve'} onClick={() => void onApprove()} forceFallback={fallback}>{busy === 'approve' ? 'در حال تأیید…' : 'تأیید درخواست'}</GlassButton>}
                </div>
                {request.status === 'submitted' && isRequester && <p className="purchase-note">درخواست‌دهنده نمی‌تواند درخواست خودش را تأیید کند؛ یک ویرایشگر دیگر باید آن را بررسی کند.</p>}
                <Feedback message={message} />
            </Panel>

            {request.purchase_order ? (
                <Panel title="سفارش تأمین‌کننده" note="قیمت‌ها و سطرهای این سفارش پس از تبدیل، تصویر تاریخی خود را حفظ می‌کنند.">
                    <p className="purchase-link-row">سفارش ساخته‌شده: <a href={href(`/purchase-orders/${request.purchase_order.id}`)}><bdi dir="ltr">{request.purchase_order.code}</bdi></a></p>
                </Panel>
            ) : request.status === 'approved' && canManage && options ? (
                <Panel title="تبدیل به سفارش خرید" note="قیمت توافقی را به ریال کامل و بر پایهٔ واحد هر سطر وارد کنید.">
                    <form className="purchase-form" onSubmit={(event) => { event.preventDefault(); void onConvert(); }} data-testid="purchase-order-convert-form" aria-label="تبدیل درخواست به سفارش خرید">
                        <label className="purchase-field" htmlFor="purchase-supplier-select"><span>تأمین‌کننده</span><select id="purchase-supplier-select" value={supplierId} onChange={(event) => setSupplierId(event.currentTarget.value)} required><option value="">انتخاب تأمین‌کننده</option>{options.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} · {supplier.name}</option>)}</select></label>
                        <div className="purchase-line-list">{request.lines.map((line) => <article className="purchase-line-card" key={line.id}>
                            <div className="purchase-line-heading"><h3>{line.product_name}</h3><span><bdi dir="ltr">{formatQuantity(line.quantity)}</bdi> {line.unit.symbol}</span></div>
                            <label className="purchase-field purchase-price-input" htmlFor={`purchase-order-price-${line.id}`}><span>قیمت توافقی هر واحد · ریال</span><input id={`purchase-order-price-${line.id}`} data-testid={`purchase-order-price-${line.id}`} dir="ltr" inputMode="numeric" value={prices[line.id] ?? ''} onChange={(event) => setPrices({ ...prices, [line.id]: event.currentTarget.value })} required /></label>
                        </article>)}</div>
                        <div className="purchase-action-row"><GlassButton data-testid="purchase-request-convert" type="submit" variant="tinted" disabled={busy === 'convert' || options.suppliers.length === 0} forceFallback={fallback}>{busy === 'convert' ? 'در حال ساخت…' : 'ساخت سفارش خرید'}</GlassButton></div>
                        {options.suppliers.length === 0 && <p className="purchase-note">برای ساخت سفارش، طرفی با نقش تأمین‌کننده در این سازمان ثبت کنید.</p>}
                    </form>
                    <Feedback message={message} />
                </Panel>
            ) : null}
        </section>
    );
}

function OrderList({ orders, filter, onFilterChange }: { orders: PurchaseOrderRecord[]; filter: string; onFilterChange: (value: string) => void }) {
    const needle = filter.trim().toLocaleLowerCase();
    const rows = useMemo(() => orders.filter((item) => `${item.code} ${item.supplier.name} ${item.source_request.code ?? ''} ${item.source_request.title ?? ''}`.toLocaleLowerCase().includes(needle)), [needle, orders]);

    return (
        <Panel title="سفارش‌های خرید سازمان فعال" note="قیمت‌های توافقی، دریافت‌های جزئی و پیوند گردش انبار از همین فهرست قابل پیگیری است.">
            <GlassSearchField label="جست‌وجو در سفارش‌های خرید" value={filter} placeholder="کد سفارش یا تأمین‌کننده" onChange={onFilterChange} />
            <div className="purchase-record-list" aria-live="polite">
                {rows.length ? rows.map((order) => <article className="purchase-record" key={order.id}>
                    <div className="purchase-record-heading"><div><p className="eyebrow"><bdi dir="ltr">{order.code}</bdi></p><h3><a className="purchase-document-link" href={href(`/purchase-orders/${order.id}`)}>{order.supplier.name}</a></h3></div><Status kind={order.status === 'closed' ? 'complete' : 'open'} label={order.status === 'closed' ? 'دریافت کامل' : 'باز برای دریافت'} /></div>
                    <div className="purchase-record-meta"><span>تأمین‌کننده: {order.supplier.name}</span><span>جمع: {formatMoney(order.total_rial)} ریال</span><span>{formatMoney(String(order.lines.length))} سطر</span></div>
                    <p className="purchase-link-row">درخواست مبدأ: <a href={href(`/purchase-requests/${order.source_request.id}`)}><bdi dir="ltr">{order.source_request.code}</bdi></a></p>
                </article>) : <Empty title={needle ? 'سفارشی پیدا نشد' : 'هنوز سفارش خریدی ساخته نشده است'}>پس از تأیید درخواست، آن را به سفارش تأمین‌کننده تبدیل کنید.</Empty>}
            </div>
        </Panel>
    );
}

function ReceiptForm({
    order, line, options, fields, onFieldsChange, busy, fallback, onReceive,
}: {
    order: PurchaseOrderRecord;
    line: PurchaseOrderLine;
    options: PurchasesOptions;
    fields: ReceiptFields;
    onFieldsChange: (value: ReceiptFields) => void;
    busy: boolean;
    fallback: boolean;
    onReceive: () => Promise<void>;
}) {
    const warehouse = options.warehouses.find((item) => String(item.id) === fields.warehouseId);
    return (
        <form className="purchase-form purchase-receipt-form" data-testid={`purchase-receipt-form-${line.id}`} aria-label={`ثبت رسید برای ${line.product_name}`} onSubmit={(event) => { event.preventDefault(); void onReceive(); }}>
            <div className="purchase-grid">
                <label className="purchase-field" htmlFor={`purchase-receipt-warehouse-${line.id}`}><span>انبار</span><select id={`purchase-receipt-warehouse-${line.id}`} data-testid={`purchase-receipt-warehouse-${line.id}`} value={fields.warehouseId} onChange={(event) => onFieldsChange({ ...fields, warehouseId: event.currentTarget.value, locationId: '' })} required><option value="">انتخاب انبار</option>{options.warehouses.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
                <label className="purchase-field" htmlFor={`purchase-receipt-location-${line.id}`}><span>مکان</span><select id={`purchase-receipt-location-${line.id}`} data-testid={`purchase-receipt-location-${line.id}`} value={fields.locationId} onChange={(event) => onFieldsChange({ ...fields, locationId: event.currentTarget.value })} required disabled={!warehouse}><option value="">انتخاب مکان</option>{(warehouse?.locations ?? []).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
                <label className="purchase-field" htmlFor={`purchase-receipt-quantity-${line.id}`}><span>مقدار این رسید · {line.unit.symbol}</span><input id={`purchase-receipt-quantity-${line.id}`} data-testid={`purchase-receipt-quantity-${line.id}`} dir="ltr" inputMode="decimal" value={fields.quantity} onChange={(event) => onFieldsChange({ ...fields, quantity: event.currentTarget.value })} required /></label>
            </div>
            <div className="purchase-action-row"><GlassButton type="submit" variant="tinted" disabled={busy || order.status !== 'open' || options.warehouses.length === 0} forceFallback={fallback}>{busy ? 'در حال ثبت رسید…' : 'ثبت رسید جزئی'}</GlassButton></div>
        </form>
    );
}

function OrderDetail({
    order, options, canManage, busyLine, fallback, receiptFields, setReceiptFields, onReceive, message,
    receiptKeys,
}: {
    order: PurchaseOrderRecord;
    options: PurchasesOptions | null;
    canManage: boolean;
    busyLine: number | null;
    fallback: boolean;
    receiptFields: Record<number, ReceiptFields>;
    setReceiptFields: (lineId: number, value: ReceiptFields) => void;
    onReceive: (line: PurchaseOrderLine) => Promise<void>;
    message: string;
    receiptKeys: Record<number, RetryKey>;
}) {
    return (
        <section className="focus-content purchase-focus" data-lg-role="focus" data-testid={`purchase-order-detail-${order.id}`}>
            <Panel title={`سفارش ${order.code}`} note={`ثبت: ${formatDate(order.ordered_at)}`}>
                <div className="purchase-record-heading"><div><p className="eyebrow">سفارش خرید · <bdi dir="ltr">{order.code}</bdi></p><h2>{order.supplier.name}</h2></div><Status kind={order.status === 'closed' ? 'complete' : 'open'} label={order.status === 'closed' ? 'دریافت کامل' : 'باز برای دریافت'} /></div>
                <div className="purchase-record-meta"><span>تأمین‌کننده: {order.supplier.name}</span><span>جمع کل: <strong>{formatMoney(order.total_rial)} ریال</strong></span><span>واحد پول: {order.currency.code} · مقیاس {order.currency.scale}</span></div>
                <p className="purchase-link-row">درخواست مبدأ: <a href={href(`/purchase-requests/${order.source_request.id}`)}><bdi dir="ltr">{order.source_request.code}</bdi> · {order.source_request.title}</a></p>
                <p className="purchase-note">مبلغ هر سطر برحسب ریال کامل، با گردکردن نیم‌به‌بالا در همان سطر محاسبه شده است؛ جمع سفارش برابر مجموع سطرهاست.</p>
                <p className="purchase-muted">سفارش‌ساز: {order.created_by ?? '—'} · پایان دریافت: {formatDate(order.closed_at)}</p>
            </Panel>

            <Panel title="سطرها و رسیدهای انبار" note="کالا و واحد از سطر سفارش تعیین می‌شوند؛ مقدار باقیمانده پس از هر دریافت دوباره محاسبه می‌شود.">
                <div className="purchase-line-list">
                    {order.lines.map((line) => {
                        const fields = receiptFields[line.id] ?? { warehouseId: '', locationId: '', quantity: line.remaining_quantity };
                        return <article className="purchase-line-card" key={line.id} data-testid={`purchase-order-line-${line.id}`} data-last-receipt-key={receiptKeys[line.id]?.value ?? ''}>
                            <div className="purchase-line-heading"><div><p className="eyebrow"><bdi dir="ltr">{line.product_code}</bdi></p><h3>{line.product_name}</h3></div><span>{line.unit.name} · <bdi dir="ltr">{line.unit.symbol}</bdi></span></div>
                            <div className="purchase-quantity-row"><span>سفارش: <bdi dir="ltr">{formatQuantity(line.ordered_quantity)}</bdi></span><span>دریافت‌شده: <bdi dir="ltr">{formatQuantity(line.received_quantity)}</bdi></span><strong>باقی‌مانده: <bdi dir="ltr">{formatQuantity(line.remaining_quantity)}</bdi></strong></div>
                            <div className="purchase-price-row"><span>قیمت توافقی هر واحد: <strong>{formatMoney(line.unit_price_rial)} ریال</strong></span><span>جمع سطر: <strong>{formatMoney(line.line_total_rial)} ریال</strong></span></div>
                            {line.receipts.length > 0 && <div className="purchase-receipt-list" aria-label="تاریخچهٔ رسیدها">
                                <h4>رسیدهای ثبت‌شده</h4>
                                {line.receipts.map((receipt) => <div className="purchase-receipt" key={receipt.id} data-testid={`purchase-receipt-${receipt.id}`}>
                                    <div className="purchase-record-heading"><strong><bdi dir="ltr">{formatQuantity(receipt.quantity)}</bdi> {line.unit.symbol}</strong><span>{formatDate(receipt.created_at)} · {receipt.actor ?? '—'}</span></div>
                                    <p className="purchase-muted">{receipt.warehouse.name} / {receipt.location.name} · <bdi dir="ltr">{receipt.warehouse.code} / {receipt.location.code}</bdi></p>
                                    <div className="purchase-receipt-links">
                                        {receipt.operation && <a href={href(`/stock/movements#operation-${receipt.operation.id}`)}>عملیات <bdi dir="ltr">{receipt.operation.reference}</bdi></a>}
                                        {receipt.movement && <a href={href(`/stock/movements#movement-${receipt.movement.id}`)}>حرکت ورودی <bdi dir="ltr">{receipt.movement.id}</bdi> · <bdi dir="ltr">{formatQuantity(receipt.movement.quantity)}</bdi></a>}
                                    </div>
                                </div>)}
                            </div>}
                            {canManage && order.status === 'open' && quantityMilli(line.remaining_quantity) > 0n && options && (
                                <ReceiptForm order={order} line={line} options={options} fields={fields} onFieldsChange={(value) => setReceiptFields(line.id, value)} busy={busyLine === line.id} fallback={fallback} onReceive={() => onReceive(line)} />
                            )}
                        </article>;
                    })}
                </div>
                {order.status === 'closed' && <p className="purchase-note">همهٔ سطرها به‌طور کامل دریافت شده‌اند. تاریخچه و تکرار امن رسیدهای قبلی در دسترس باقی می‌ماند.</p>}
                {canManage && order.status === 'open' && options?.warehouses.length === 0 && <p className="purchase-note">برای ثبت رسید، ابتدا انبار و مکان را در اطلاعات پایه آماده کنید.</p>}
                <Feedback message={message} />
            </Panel>
        </section>
    );
}

export function PurchasingScreen() {
    const route = currentRoute();
    const isRequest = route.resource === 'purchase-requests';
    const detailHref = isRequest ? '/purchase-requests' : '/purchase-orders';
    const forceFallback = new URLSearchParams(window.location.search).get('glass') === 'fallback';
    const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
    const [options, setOptions] = useState<PurchasesOptions | null>(null);
    const [requests, setRequests] = useState<PurchaseRequestRecord[]>([]);
    const [orders, setOrders] = useState<PurchaseOrderRecord[]>([]);
    const [purchaseRequest, setPurchaseRequest] = useState<PurchaseRequestRecord | null>(null);
    const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrderRecord | null>(null);
    const [loadState, setLoadState] = useState<LoadState>('loading');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState('');
    const [busyLine, setBusyLine] = useState<number | null>(null);
    const [filter, setFilter] = useState('');
    const [reloadCounter, setReloadCounter] = useState(0);
    const [prices, setPrices] = useState<Record<number, string>>({});
    const [supplierId, setSupplierId] = useState('');
    const [receiptFields, setReceiptFieldsState] = useState<Record<number, ReceiptFields>>({});
    const [receiptKeys, setReceiptKeys] = useState<Record<number, RetryKey>>({});
    const canManage = Boolean(options?.can_manage && workspace?.active_organization.role === 'editor');

    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            setLoadState('loading');
            setError('');
            try {
                const [context, purchaseOptions] = await Promise.all([
                    fetchWorkspaceContext(controller.signal),
                    fetchPurchasesOptions(controller.signal),
                ]);
                setWorkspace(context);
                setOptions(purchaseOptions);
                if (isRequest && route.id !== null) {
                    const record = await fetchPurchaseRequest(route.id, controller.signal);
                    setPurchaseRequest(record);
                    setPurchaseOrder(null);
                    setPrices(Object.fromEntries(record.lines.map((line) => [line.id, ''])));
                } else if (!isRequest && route.id !== null) {
                    const record = await fetchPurchaseOrder(route.id, controller.signal);
                    setPurchaseOrder(record);
                    setPurchaseRequest(null);
                    setReceiptFieldsState(Object.fromEntries(record.lines.map((line) => [line.id, { warehouseId: '', locationId: '', quantity: line.remaining_quantity }])));
                } else if (isRequest) {
                    setRequests(await fetchPurchaseRequests(controller.signal));
                    setPurchaseRequest(null);
                    setPurchaseOrder(null);
                } else {
                    setOrders(await fetchPurchaseOrders(controller.signal));
                    setPurchaseRequest(null);
                    setPurchaseOrder(null);
                }
                setLoadState('ready');
            } catch (cause) {
                if (controller.signal.aborted) return;
                const failure = cause instanceof Error ? cause : new Error('دریافت اطلاعات خرید انجام نشد.');
                setError(failure.message);
                setLoadState(cause instanceof PurchaseApiError && cause.status === 403 ? 'denied' : 'error');
            }
        }
        void load();
        return () => controller.abort();
    }, [isRequest, reloadCounter, route.id]);

    function setReceiptFields(lineId: number, value: ReceiptFields) {
        setReceiptFieldsState((current) => ({ ...current, [lineId]: value }));
    }

    async function runAction(name: string, action: () => Promise<void>) {
        setBusy(name);
        setError('');
        setNotice('');
        try {
            await action();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'عملیات خرید انجام نشد.');
        } finally {
            setBusy('');
        }
    }

    async function submitDraft(title: string, lines: DraftLine[]) {
        await runAction('create', async () => {
            const created = await createPurchaseRequest({
                title,
                lines: lines.map((line) => ({ product_id: Number(line.productId), quantity: line.quantity.trim() })),
            });
            window.location.assign(href(`/purchase-requests/${created.id}`));
        });
    }

    async function submitRequest(id: number) {
        await runAction(`submit-${id}`, async () => {
            const updated = await submitPurchaseRequest(id);
            setNotice('درخواست برای بررسی و تأیید ارسال شد.');
            if (route.id === id) setPurchaseRequest(updated);
            else setReloadCounter((value) => value + 1);
        });
    }

    async function approveRequest() {
        if (!purchaseRequest) return;
        await runAction('approve', async () => {
            setPurchaseRequest(await approvePurchaseRequest(purchaseRequest.id));
            setNotice('درخواست با ثبت تأییدکننده و زمان تأیید شد.');
        });
    }

    async function convertRequest() {
        if (!purchaseRequest || !supplierId) return;
        await runAction('convert', async () => {
            const result = await convertPurchaseRequest(purchaseRequest.id, {
                supplier_party_id: Number(supplierId),
                lines: purchaseRequest.lines.map((line) => ({ source_request_line_id: line.id, unit_price_rial: (prices[line.id] ?? '').trim() })),
            });
            window.location.assign(href(`/purchase-orders/${result.order.id}`));
        });
    }

    async function receiveLine(line: PurchaseOrderLine) {
        if (!purchaseOrder) return;
        const fields = receiptFields[line.id] ?? { warehouseId: '', locationId: '', quantity: line.remaining_quantity };
        if (!fields.warehouseId || !fields.locationId) {
            setError('انبار و مکان را انتخاب کنید.');
            return;
        }
        const payload = { warehouse_id: Number(fields.warehouseId), location_id: Number(fields.locationId), quantity: fields.quantity.trim() };
        const key = nextRetryKey(receiptKeys[line.id] ?? null, { order_id: purchaseOrder.id, line_id: line.id, ...payload });
        setReceiptKeys((current) => ({ ...current, [line.id]: key }));
        setBusyLine(line.id);
        setError('');
        setNotice('');
        try {
            const result = await receivePurchaseOrderLine(purchaseOrder.id, line.id, payload, key.value);
            setPurchaseOrder(result.order);
            setReceiptFieldsState((current) => ({ ...current, [line.id]: { ...fields, quantity: result.order.lines.find((item) => item.id === line.id)?.remaining_quantity ?? '0.000' } }));
            setNotice(result.already_exists ? 'تکرار امن همان رسید بازیابی شد.' : 'رسید و حرکت ورودی انبار با هم ثبت شدند.');
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'ثبت رسید انجام نشد.');
        } finally {
            setBusyLine(null);
        }
    }

    async function refresh() {
        setReloadCounter((value) => value + 1);
    }

    const toolbar = <GlassButton onClick={() => void refresh()} forceFallback={forceFallback}>به‌روزرسانی</GlassButton>;
    const title = isRequest ? 'درخواست‌های خرید' : 'سفارش‌های خرید';
    const subtitle = isRequest
        ? 'ثبت نیاز کالا، ارسال برای تأیید و تبدیل درخواست تأییدشده به سفارش تأمین‌کننده'
        : 'دریافت جزئی کالا از تأمین‌کننده، پیگیری ماندهٔ سفارش و گردش مرتبط انبار';

    if (!workspace) {
        return <main className="app-shell"><div className="app-shell-inner"><section className="state-panel" role={loadState === 'error' ? 'alert' : 'status'}><h1>{loadState === 'loading' ? 'در حال بارگیری خرید…' : 'فضای خرید باز نشد'}</h1>{error && <p>{error}</p>}</section></div></main>;
    }

    const currentPath = isRequest ? (route.id === null ? '/purchase-requests' : `/purchase-requests/${route.id}`) : (route.id === null ? '/purchase-orders' : `/purchase-orders/${route.id}`);
    const content = loadState === 'loading'
        ? <section className="focus-content purchase-focus" data-lg-role="focus"><div className="purchase-panel" role="status">در حال بارگیری سند…</div></section>
        : loadState === 'error' || loadState === 'denied'
            ? <section className="focus-content purchase-focus" data-lg-role="focus"><div className="purchase-panel" role="alert"><h2>{loadState === 'denied' ? 'دسترسی خرید مجاز نیست' : 'اطلاعات خرید بارگیری نشد'}</h2><p>{error}</p><GlassButton variant="tinted" onClick={() => void refresh()} forceFallback={forceFallback}>تلاش دوباره</GlassButton></div></section>
            : isRequest && route.id !== null && purchaseRequest
                ? <>
                        <RequestDetail request={purchaseRequest} options={options} canManage={canManage} busy={busy} fallback={forceFallback} message={error} prices={prices} setPrices={setPrices} supplierId={supplierId} setSupplierId={setSupplierId} onSubmit={() => submitRequest(purchaseRequest.id)} onApprove={approveRequest} onConvert={convertRequest} />
                    {notice && <p className="purchase-note" role="status">{notice}</p>}
                </>
                : !isRequest && route.id !== null && purchaseOrder
                    ? <>
                        <OrderDetail order={purchaseOrder} options={options} canManage={canManage} busyLine={busyLine} fallback={forceFallback} receiptFields={receiptFields} setReceiptFields={setReceiptFields} onReceive={receiveLine} message={error} receiptKeys={receiptKeys} />
                        {notice && <p className="purchase-note" role="status">{notice}</p>}
                    </>
                    : isRequest
                        ? <section className="focus-content purchase-focus" data-lg-role="focus">
                            {canManage && options && <PurchaseRequestForm options={options} busy={busy === 'create'} fallback={forceFallback} onCreate={submitDraft} />}
                            <RequestList requests={requests} options={options} canManage={canManage} busyId={busy.startsWith('submit-') ? Number(busy.slice(7)) : null} fallback={forceFallback} filter={filter} onFilterChange={setFilter} onSubmit={submitRequest} />
                            {notice && <p className="purchase-note" role="status">{notice}</p>}
                            {error && <Feedback message={error} />}
                        </section>
                        : <section className="focus-content purchase-focus" data-lg-role="focus"><OrderList orders={orders} filter={filter} onFilterChange={setFilter} />{notice && <p className="purchase-note" role="status">{notice}</p>}{error && <Feedback message={error} />}</section>;

    return (
        <WorkspaceShell
            title={title}
            eyebrow="گردش خرید · P08"
            subtitle={subtitle}
            activePage={route.id === null ? 'list' : 'detail'}
            connectionState={loadState === 'error' || loadState === 'denied' ? 'error' : loadState === 'loading' ? 'loading' : 'ready'}
            connectionLabel={loadState === 'ready' ? 'اتصال آماده است' : loadState === 'loading' ? 'در حال دریافت' : 'نیازمند بررسی'}
            detailHref={route.id === null ? undefined : href(currentPath)}
            detailLabel={route.id === null ? undefined : isRequest ? purchaseRequest?.code ?? String(route.id) : purchaseOrder?.code ?? String(route.id)}
            toolbar={toolbar}
            forceFallback={forceFallback}
            activeOrganization={workspace.active_organization}
            organizations={workspace.organizations}
            onOrganizationChange={(organizationId) => { void selectOrganization(organizationId).then(() => window.location.reload()).catch((cause) => setError(cause instanceof Error ? cause.message : 'تغییر سازمان انجام نشد.')); }}
            onSignOut={() => { void signOut(); }}
            organizationSwitching={false}
            activeResource={route.resource}
            phaseLabel="P08"
        >
            {content}
        </WorkspaceShell>
    );
}
