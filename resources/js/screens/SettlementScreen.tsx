import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
    createCustomerInvoice,
    createSupplierInvoice,
    fetchSettlementInvoices,
    fetchSettlementOptions,
    paySupplierInvoice,
    SettlementApiError,
    settleCustomerInvoice,
    type SettlementDirection,
    type SettlementInvoice,
    type SettlementOptions,
    type SettlementSourceEvent,
    type SettlementSourceLine,
    type SettlementSourceOrder,
} from '../api/settlements';
import { fetchWorkspaceContext, selectOrganization, signOut, type WorkspaceContext } from '../api/products';
import { GlassButton } from '../components/GlassButton';
import { GlassSearchField } from '../components/GlassSearchField';
import { WorkspaceShell } from '../components/WorkspaceShell';

type LoadState = 'loading' | 'ready' | 'error' | 'denied';
type RetryKey = { signature: string; value: string } | null;
type SettlementFields = { amount: string; effectiveOn: string; reference: string };

function localDate(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));

    return `${value.year}-${value.month}-${value.day}`;
}

function formatRial(value: string): string {
    try {
        return new Intl.NumberFormat('fa-IR').format(BigInt(value));
    } catch {
        return value;
    }
}

function formatToman(value: string | null): string {
    if (value === null) return '—';
    const [whole, fraction] = value.split('.', 2);
    const formatted = new Intl.NumberFormat('fa-IR').format(BigInt(whole));
    return fraction ? `${formatted}٫${String.fromCharCode(0x06f0 + Number(fraction))}` : formatted;
}

function formatDate(value: string | null): string {
    if (!value) return '—';
    const date = new Date(`${value.slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.getTime())
        ? value
        : new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeZone: 'Asia/Tehran' }).format(date);
}

function quantityToMilli(value: string): string {
    const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,3}))?$/.exec(value.trim());
    if (!match) throw new Error('مقدار را با حداکثر سه رقم اعشار وارد کنید.');
    const milli = BigInt(match[1]) * 1000n + BigInt((match[2] ?? '').padEnd(3, '0'));
    if (milli > 999_999_999_999n) throw new Error('مقدار از بازهٔ پشتیبانی‌شده بیشتر است.');

    return milli.toString();
}

function nextRetryKey(previous: RetryKey, payload: unknown): NonNullable<RetryKey> {
    const signature = JSON.stringify(payload);
    return previous?.signature === signature ? previous : { signature, value: crypto.randomUUID() };
}

function Panel({ title, note, children, className = '' }: { title: string; note?: string; children: ReactNode; className?: string }) {
    return (
        <section className={`settlement-panel ${className}`.trim()}>
            <header className="settlement-panel-heading"><div><h2>{title}</h2>{note && <p className="settlement-muted">{note}</p>}</div></header>
            {children}
        </section>
    );
}

function InvoiceSourceForm({
    direction, options, source, bookId, effectiveOn, dueOn, quantities, busy, fallback,
    onBookChange, onSourceChange, onDateChange, onQuantityChange, onSubmit,
}: {
    direction: SettlementDirection;
    options: SettlementOptions;
    source: SettlementSourceOrder | null;
    bookId: number | null;
    effectiveOn: string;
    dueOn: string;
    quantities: Record<number, string>;
    busy: boolean;
    fallback: boolean;
    onBookChange: (value: number) => void;
    onSourceChange: (value: number) => void;
    onDateChange: (field: 'effectiveOn' | 'dueOn', value: string) => void;
    onQuantityChange: (eventId: number, value: string) => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
    const sources = direction === 'customer' ? options.customer_sources : options.supplier_sources;
    const isCustomer = direction === 'customer';
    const linesForSource = source?.lines ?? [];

    return (
        <Panel title={isCustomer ? 'صورتحساب مشتری' : 'صورتحساب تأمین‌کننده'} note={isCustomer ? 'مبنای این مسیر، مقدار تحویل‌شده از سفارش فروش است.' : 'مبنای این مسیر، مقدار ثبت‌شده در رسیدهای انبار است.'}>
            {options.books.length === 0 ? <p className="settlement-note">ابتدا در دفتر روزنامهٔ P09 یک دفتر ریالی بسازید.</p> : (
                <form className="settlement-form" onSubmit={onSubmit} data-testid="settlement-invoice-form">
                    <label className="settlement-field" htmlFor="settlement-book"><span>دفتر ریالی</span>
                        <select id="settlement-book" value={bookId ?? ''} onChange={(event) => onBookChange(Number(event.currentTarget.value))} required>
                            {options.books.map((book) => <option key={book.id} value={book.id}>{book.name} · {book.code}{book.posting_ready ? '' : ' · غیرفعال'}</option>)}
                        </select>
                    </label>
                    {options.books.find((book) => book.id === bookId)?.posting_mode === 'synthetic_test' && (
                        <p className="settlement-note" role="note">این دفتر فقط برای پذیرش با دادهٔ synthetic است؛ نگاشت آن تأیید حسابداری واقعی نیست.</p>
                    )}
                    <label className="settlement-field" htmlFor="settlement-source"><span>{isCustomer ? 'سفارش فروش' : 'سفارش خرید'}</span>
                        <select id="settlement-source" value={source?.id ?? ''} onChange={(event) => onSourceChange(Number(event.currentTarget.value))} required>
                            <option value="">انتخاب سفارش</option>
                            {sources.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.party.name ?? item.party.code ?? 'طرف حساب'}</option>)}
                        </select>
                    </label>
                    <div className="settlement-date-grid">
                        <label className="settlement-field" htmlFor="settlement-effective-on"><span>تاریخ ثبت حسابداری</span><input id="settlement-effective-on" type="date" value={effectiveOn} onChange={(event) => onDateChange('effectiveOn', event.currentTarget.value)} required /></label>
                        <label className="settlement-field" htmlFor="settlement-due-on"><span>سررسید</span><input id="settlement-due-on" type="date" value={dueOn} onChange={(event) => onDateChange('dueOn', event.currentTarget.value)} required /></label>
                    </div>
                    {source && linesForSource.length > 0 ? (
                        <div className="settlement-source-list" aria-label="منابع قابل صورتحساب">
                            {linesForSource.map((line) => (isCustomer ? line.deliveries ?? [] : line.receipts ?? []).map((event) => (
                                <SourceQuantity key={event.id} line={line} event={event} direction={direction} value={quantities[event.id] ?? event.available_quantity} onChange={(value) => onQuantityChange(event.id, value)} />
                            )))}
                        </div>
                    ) : <p className="settlement-empty">{source ? 'برای این سفارش منبع تحویل یا رسیدِ صورتحساب‌نشده باقی نمانده است.' : 'سفارشی با تحویل یا رسید قابل صورتحساب انتخاب کنید.'}</p>}
                    {options.books.find((book) => book.id === bookId)?.posting_ready && options.can_manage && source && linesForSource.length > 0 && (
                        <div className="settlement-action-row">
                            <GlassButton type="submit" variant="tinted" disabled={busy || !linesForSource.length} forceFallback={fallback}>{busy ? 'در حال ثبت…' : isCustomer ? 'ثبت صورتحساب مشتری' : 'ثبت صورتحساب تأمین‌کننده'}</GlassButton>
                        </div>
                    )}
                </form>
            )}
        </Panel>
    );
}

function SourceQuantity({ line, event, direction, value, onChange }: {
    line: SettlementSourceLine;
    event: SettlementSourceEvent;
    direction: SettlementDirection;
    value: string;
    onChange: (value: string) => void;
}) {
    const label = direction === 'customer' ? `تحویل فروش ${event.id}` : `رسید انبار ${event.id}`;
    const operationId = event.operation_id ?? event.inventory_operation_id;
    const movementId = event.movement_id ?? event.inventory_movement_id;

    return (
        <article className="settlement-source-row">
            <div className="settlement-source-info">
                <strong>{line.item_name}</strong>
                <span><bdi dir="ltr">{line.item_code}</bdi> · {line.unit_name} · موجود برای صورتحساب: <bdi dir="ltr">{event.available_quantity}</bdi></span>
                <span className="settlement-source-links"><bdi dir="ltr">{label}</bdi>
                    {operationId && <> · عملیات <a className="settlement-link" href={`/stock/movements#operation-${operationId}`}><bdi dir="ltr">{operationId}</bdi></a></>}
                    {movementId && <> · حرکت <a className="settlement-link" href={`/stock/movements#movement-${movementId}`}><bdi dir="ltr">{movementId}</bdi></a></>}
                </span>
            </div>
            <label className="settlement-field settlement-quantity-field" htmlFor={`settlement-qty-${direction}-${event.id}`}>
                <span>مقدار</span><input id={`settlement-qty-${direction}-${event.id}`} data-testid={`settlement-qty-${direction}-${event.id}`} dir="ltr" inputMode="decimal" value={value} onChange={(input) => onChange(input.currentTarget.value)} aria-label={`مقدار ${label}`} />
            </label>
        </article>
    );
}

function SettlementForm({ invoice, busy, fallback, fields, onFieldsChange, onSubmit }: {
    invoice: SettlementInvoice;
    busy: boolean;
    fallback: boolean;
    fields: SettlementFields;
    onFieldsChange: (value: SettlementFields) => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
    const label = invoice.direction === 'customer' ? 'دریافت مشتری' : 'پرداخت تأمین‌کننده';

    return (
        <form className="settlement-payment-form" onSubmit={onSubmit} data-testid={`settlement-payment-form-${invoice.id}`}>
            <label className="settlement-field" htmlFor={`settlement-amount-${invoice.id}`}><span>مبلغ {label} (ریال)</span>
                <input id={`settlement-amount-${invoice.id}`} dir="ltr" inputMode="numeric" value={fields.amount} onChange={(event) => onFieldsChange({ ...fields, amount: event.currentTarget.value })} required />
            </label>
            <label className="settlement-field" htmlFor={`settlement-date-${invoice.id}`}><span>تاریخ رویداد خزانه</span>
                <input id={`settlement-date-${invoice.id}`} type="date" value={fields.effectiveOn} onChange={(event) => onFieldsChange({ ...fields, effectiveOn: event.currentTarget.value })} required />
            </label>
            <label className="settlement-field" htmlFor={`settlement-reference-${invoice.id}`}><span>مرجع پرداخت (اختیاری)</span>
                <input id={`settlement-reference-${invoice.id}`} value={fields.reference} onChange={(event) => onFieldsChange({ ...fields, reference: event.currentTarget.value })} maxLength={120} />
            </label>
            <GlassButton type="submit" variant="tinted" disabled={busy} forceFallback={fallback}>{busy ? 'در حال ثبت…' : label}</GlassButton>
        </form>
    );
}

function InvoiceCard({ invoice, canManage, postingReady, busy, fallback, fields, onFieldsChange, onSettle }: {
    invoice: SettlementInvoice;
    canManage: boolean;
    postingReady: boolean;
    busy: boolean;
    fallback: boolean;
    fields: SettlementFields;
    onFieldsChange: (value: SettlementFields) => void;
    onSettle: (event: FormEvent<HTMLFormElement>) => void;
}) {
    const customer = invoice.direction === 'customer';
    const paidLabel = customer ? 'دریافت‌شده' : 'پرداخت‌شده';

    return (
        <article className="settlement-invoice-card" data-testid={`settlement-invoice-${invoice.direction}-${invoice.id}`}>
            <header className="settlement-invoice-heading">
                <div><p className="settlement-eyebrow"><bdi dir="ltr">{invoice.code}</bdi> · {customer ? 'صورتحساب مشتری' : 'صورتحساب تأمین‌کننده'}</p><h3>{invoice.party.name ?? 'طرف حساب'}</h3></div>
                <span className="settlement-status">ثبت‌شده</span>
            </header>
            <div className="settlement-meta"><span>دفتر: {invoice.book.name ?? '—'} · <bdi dir="ltr">{invoice.book.code}</bdi></span><span>ثبت: {formatDate(invoice.effective_on)}</span><span>سررسید: {formatDate(invoice.due_on)}</span></div>
            <p className="settlement-source-order">منبع: <a className="settlement-link" href={customer ? `/orders/${invoice.source.id}` : `/purchase-orders/${invoice.source.id}`}><bdi dir="ltr">{invoice.source.code ?? invoice.source.id}</bdi></a></p>
            <div className="settlement-amount-grid">
                <div><span>مبلغ اصلی</span><strong><bdi dir="ltr">{formatRial(invoice.amount_rial)}</bdi> ریال</strong>{customer && <small><bdi dir="ltr">{formatToman(invoice.amount_toman)}</bdi> تومان</small>}</div>
                <div><span>{paidLabel}</span><strong><bdi dir="ltr">{formatRial(invoice.allocated_rial)}</bdi> ریال</strong></div>
                <div className="settlement-balance"><span>مانده</span><strong><bdi dir="ltr">{formatRial(invoice.outstanding_rial)}</bdi> ریال</strong>{customer && <small><bdi dir="ltr">{formatToman(invoice.outstanding_toman)}</bdi> تومان</small>}</div>
            </div>
            <div className="settlement-link-list">
                <p>ژورنال صورتحساب: {invoice.journal ? <a className="settlement-link" href={`/accounting/journals/${invoice.journal.id}`}><bdi dir="ltr">{invoice.journal.code}</bdi> · متوازن</a> : '—'}</p>
                {invoice.lines.map((line) => (
                    <p key={line.id}>
                        {line.source.type === 'sales_delivery' ? 'تحویل فروش' : 'رسید انبار'} <bdi dir="ltr">{line.source.id}</bdi>
                        {' · '}<bdi dir="ltr">{line.quantity}</bdi> {line.unit_name}
                        {line.source.operation_id && <> · عملیات <a className="settlement-link" href={`/stock/movements#operation-${line.source.operation_id}`}><bdi dir="ltr">{line.source.operation_id}</bdi></a></>}
                        {line.source.movement_id && <> · حرکت <a className="settlement-link" href={`/stock/movements#movement-${line.source.movement_id}`}><bdi dir="ltr">{line.source.movement_id}</bdi></a></>}
                    </p>
                ))}
                {invoice.allocations.map((allocation) => allocation.treasury_movement && (
                    <p id={`treasury-movement-${allocation.treasury_movement.id}`} key={allocation.id}>
                        {customer ? 'دریافت خزانه' : 'پرداخت خزانه'} <a className="settlement-link" href={`#treasury-movement-${allocation.treasury_movement.id}`}><bdi dir="ltr">#{allocation.treasury_movement.id}</bdi></a>
                        {' · '}<bdi dir="ltr">{formatRial(allocation.amount_rial)}</bdi> ریال · {formatDate(allocation.effective_on)}
                        {allocation.treasury_movement.journal && <> · ژورنال <a className="settlement-link" href={`/accounting/journals/${allocation.treasury_movement.journal.id}`}><bdi dir="ltr">{allocation.treasury_movement.journal.code}</bdi></a></>}
                    </p>
                ))}
            </div>
            {canManage && postingReady && BigInt(invoice.outstanding_rial) > 0n && <SettlementForm invoice={invoice} busy={busy} fallback={fallback} fields={fields} onFieldsChange={onFieldsChange} onSubmit={onSettle} />}
        </article>
    );
}

export function SettlementScreen() {
    const forceFallback = new URLSearchParams(window.location.search).get('glass') === 'fallback';
    const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
    const [options, setOptions] = useState<SettlementOptions | null>(null);
    const [invoices, setInvoices] = useState<SettlementInvoice[]>([]);
    const [direction, setDirection] = useState<SettlementDirection>('customer');
    const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
    const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
    const [quantities, setQuantities] = useState<Record<number, string>>({});
    const [effectiveOn, setEffectiveOn] = useState(localDate());
    const [dueOn, setDueOn] = useState(localDate());
    const [settlementFields, setSettlementFields] = useState<Record<number, SettlementFields>>({});
    const [invoiceRetryKey, setInvoiceRetryKey] = useState<RetryKey>(null);
    const [settlementKeys, setSettlementKeys] = useState<Record<number, RetryKey>>({});
    const [loadState, setLoadState] = useState<LoadState>('loading');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState('');
    const [filter, setFilter] = useState('');
    const [reloadCounter, setReloadCounter] = useState(0);
    const canManage = Boolean(options?.can_manage && workspace?.active_organization.role === 'editor');
    const sources = direction === 'customer' ? options?.customer_sources ?? [] : options?.supplier_sources ?? [];
    const selectedSource = sources.find((source) => source.id === selectedSourceId) ?? null;
    const selectedBook = options?.books.find((book) => book.id === selectedBookId) ?? null;
    const visibleInvoices = useMemo(() => invoices
        .filter((invoice) => invoice.direction === direction)
        .filter((invoice) => `${invoice.code} ${invoice.party.name ?? ''} ${invoice.source.code ?? ''}`.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase())), [direction, filter, invoices]);

    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            setLoadState('loading');
            setError('');
            try {
                const [context, nextOptions, nextInvoices] = await Promise.all([
                    fetchWorkspaceContext(controller.signal),
                    fetchSettlementOptions(controller.signal),
                    fetchSettlementInvoices(undefined, controller.signal),
                ]);
                setWorkspace(context);
                setOptions(nextOptions);
                setInvoices(nextInvoices);
                setSelectedBookId((current) => current ?? nextOptions.books.find((book) => book.posting_ready)?.id ?? nextOptions.books[0]?.id ?? null);
                setLoadState('ready');
            } catch (cause) {
                if (controller.signal.aborted) return;
                setError(cause instanceof Error ? cause.message : 'بارگیری تسویه‌ها انجام نشد.');
                setLoadState(cause instanceof SettlementApiError && cause.status === 403 ? 'denied' : 'error');
            }
        }
        void load();
        return () => controller.abort();
    }, [reloadCounter]);

    useEffect(() => {
        const next = sources[0] ?? null;
        setSelectedSourceId((current) => next && sources.some((source) => source.id === current) ? current : next?.id ?? null);
    }, [direction, options]);

    useEffect(() => {
        if (!selectedSource) {
            setQuantities({});
            return;
        }
        const entries = selectedSource.lines.flatMap((line) => (direction === 'customer' ? line.deliveries ?? [] : line.receipts ?? [])
            .map((event) => [event.id, event.available_quantity] as const));
        setQuantities(Object.fromEntries(entries));
    }, [direction, selectedSourceId, options]);

    function refresh() {
        setReloadCounter((value) => value + 1);
    }

    async function createInvoice(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selectedSource || !selectedBookId || !options) return;
        setError('');
        setNotice('');
        setBusy('invoice');
        try {
            const customerLines: Array<{ sales_order_line_id: number; sales_order_delivery_id: number; quantity_milli: string }> = [];
            const supplierLines: Array<{ purchase_order_line_id: number; purchase_receipt_id: number; quantity_milli: string }> = [];
            selectedSource.lines.forEach((line) => {
                const events = direction === 'customer' ? line.deliveries ?? [] : line.receipts ?? [];
                events.forEach((sourceEvent) => {
                    const milli = quantityToMilli(quantities[sourceEvent.id] ?? '0');
                    if (milli === '0') return;
                    if (direction === 'customer') customerLines.push({ sales_order_line_id: line.id, sales_order_delivery_id: sourceEvent.id, quantity_milli: milli });
                    else supplierLines.push({ purchase_order_line_id: line.id, purchase_receipt_id: sourceEvent.id, quantity_milli: milli });
                });
            });
            if (direction === 'customer') {
                if (customerLines.length === 0) throw new Error('برای صورتحساب دست‌کم یک مقدار مثبت انتخاب کنید.');
                const payload = { book_id: selectedBookId, effective_on: effectiveOn, due_on: dueOn, lines: customerLines };
                const key = nextRetryKey(invoiceRetryKey, { direction, source_id: selectedSource.id, ...payload });
                setInvoiceRetryKey(key);
                const result = await createCustomerInvoice(selectedSource.id, payload, key.value);
                setNotice(result.already_exists ? 'تکرار امن همان صورتحساب بازیابی شد.' : 'صورتحساب و ژورنال آن با هم ثبت شدند.');
            } else {
                if (supplierLines.length === 0) throw new Error('برای صورتحساب دست‌کم یک مقدار مثبت انتخاب کنید.');
                const payload = { book_id: selectedBookId, effective_on: effectiveOn, due_on: dueOn, lines: supplierLines };
                const key = nextRetryKey(invoiceRetryKey, { direction, source_id: selectedSource.id, ...payload });
                setInvoiceRetryKey(key);
                const result = await createSupplierInvoice(selectedSource.id, payload, key.value);
                setNotice(result.already_exists ? 'تکرار امن همان صورتحساب بازیابی شد.' : 'صورتحساب و ژورنال آن با هم ثبت شدند.');
            }
            refresh();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'ثبت صورتحساب انجام نشد.');
        } finally {
            setBusy('');
        }
    }

    function setSettlementFieldsFor(invoice: SettlementInvoice, fields: SettlementFields) {
        setSettlementFields((current) => ({ ...current, [invoice.id]: fields }));
    }

    async function settle(invoice: SettlementInvoice, event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const fields = settlementFields[invoice.id] ?? { amount: invoice.outstanding_rial, effectiveOn: localDate(), reference: '' };
        const amount = fields.amount.trim();
        if (!/^[0-9]{1,20}$/.test(amount) || BigInt(amount) < 1n) {
            setError('مبلغ باید عدد صحیح مثبت برحسب ریال باشد.');
            return;
        }
        const payload = { amount_rial: amount, effective_on: fields.effectiveOn, reference: fields.reference.trim() };
        const key = nextRetryKey(settlementKeys[invoice.id] ?? null, { invoice_id: invoice.id, direction, ...payload });
        setSettlementKeys((current) => ({ ...current, [invoice.id]: key }));
        setError('');
        setNotice('');
        setBusy(`settlement-${invoice.id}`);
        try {
            const result = invoice.direction === 'customer'
                ? await settleCustomerInvoice(invoice.id, payload, key.value)
                : await paySupplierInvoice(invoice.id, payload, key.value);
            setNotice(result.already_exists ? 'تکرار امن همان تسویه بازیابی شد.' : 'حرکت خزانه، تخصیص و ژورنال با هم ثبت شدند.');
            refresh();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'ثبت تسویه انجام نشد.');
        } finally {
            setBusy('');
        }
    }

    const toolbar = <div className="settlement-toolbar"><GlassButton onClick={refresh} forceFallback={forceFallback}>به‌روزرسانی</GlassButton></div>;
    const selectedBookPostingReady = Boolean(selectedBook?.posting_ready);
    const content = loadState === 'loading'
        ? <section className="focus-content settlement-focus" data-lg-role="focus"><div className="settlement-panel" role="status">در حال بارگیری صورتحساب‌ها و تسویه‌ها…</div></section>
        : loadState === 'error' || loadState === 'denied'
            ? <section className="focus-content settlement-focus" data-lg-role="focus"><div className="settlement-panel" role="alert"><h2>{loadState === 'denied' ? 'دسترسی حسابداری مجاز نیست' : 'اطلاعات تسویه بارگیری نشد'}</h2><p>{error}</p><GlassButton variant="tinted" onClick={refresh} forceFallback={forceFallback}>تلاش دوباره</GlassButton></div></section>
            : (
                <section className="focus-content settlement-focus" data-lg-role="focus">
                    <div className="settlement-layout">
                        <section className="settlement-register" aria-label="دفتر صورتحساب و تسویه">
                            <Panel title="دفتر صورتحساب‌ها" note="مانده از مبلغ ثبت‌شده منهای تخصیص‌های متصل به ژورنال محاسبه می‌شود.">
                                <div className="settlement-tabs" role="tablist" aria-label="جهت صورتحساب">
                                    <button type="button" role="tab" aria-selected={direction === 'customer'} className={direction === 'customer' ? 'is-current' : ''} onClick={() => setDirection('customer')}>دریافتنی مشتریان</button>
                                    <button type="button" role="tab" aria-selected={direction === 'supplier'} className={direction === 'supplier' ? 'is-current' : ''} onClick={() => setDirection('supplier')}>پرداختنی تأمین‌کنندگان</button>
                                </div>
                                <GlassSearchField label="جست‌وجو در صورتحساب‌ها" value={filter} placeholder="کد، طرف حساب یا سفارش" onChange={setFilter} />
                                {visibleInvoices.length > 0 ? <div className="settlement-invoice-list">
                                    {visibleInvoices.map((invoice) => {
                                        const bookReady = Boolean(options?.books.find((book) => book.id === invoice.book.id)?.posting_ready);
                                        const defaultFields = { amount: invoice.outstanding_rial, effectiveOn: localDate(), reference: '' };
                                        return <InvoiceCard key={invoice.id} invoice={invoice} canManage={canManage} postingReady={bookReady} busy={busy === `settlement-${invoice.id}`} fallback={forceFallback} fields={settlementFields[invoice.id] ?? defaultFields} onFieldsChange={(value) => setSettlementFieldsFor(invoice, value)} onSettle={(event) => void settle(invoice, event)} />;
                                    })}
                                </div> : <p className="settlement-empty">{filter ? 'صورتحسابی با این جست‌وجو پیدا نشد.' : direction === 'customer' ? 'هنوز صورتحساب مشتری ثبت نشده است.' : 'هنوز صورتحساب تأمین‌کننده ثبت نشده است.'}</p>}
                            </Panel>
                        </section>
                        <aside className="settlement-rail" data-lg-role="rail">
                            {options && <div className="settlement-direction-switch" role="group" aria-label="نوع صورتحساب تازه">
                                <button type="button" className={direction === 'customer' ? 'is-current' : ''} onClick={() => setDirection('customer')}>مشتری</button>
                                <button type="button" className={direction === 'supplier' ? 'is-current' : ''} onClick={() => setDirection('supplier')}>تأمین‌کننده</button>
                            </div>}
                            {canManage && selectedBookPostingReady && selectedSource ? (
                                <InvoiceSourceForm direction={direction} options={options!} source={selectedSource} bookId={selectedBookId} effectiveOn={effectiveOn} dueOn={dueOn} quantities={quantities} busy={busy === 'invoice'} fallback={forceFallback} onBookChange={setSelectedBookId} onSourceChange={setSelectedSourceId} onDateChange={(field, value) => field === 'effectiveOn' ? setEffectiveOn(value) : setDueOn(value)} onQuantityChange={(eventId, value) => setQuantities((current) => ({ ...current, [eventId]: value }))} onSubmit={(event) => void createInvoice(event)} />
                            ) : options?.books.length && canManage ? (
                                <Panel title="ثبت صورتحساب">
                                    <label className="settlement-field" htmlFor="settlement-book-readonly"><span>دفتر ریالی</span><select id="settlement-book-readonly" value={selectedBookId ?? ''} onChange={(event) => setSelectedBookId(Number(event.currentTarget.value))}>{options.books.map((book) => <option key={book.id} value={book.id}>{book.name} · {book.code}</option>)}</select></label>
                                    <p className="settlement-note" role="status">{selectedBook?.posting_blocker ?? 'ابتدا دفتر و منبع صورتحساب را انتخاب کنید.'}</p>
                                </Panel>
                            ) : !canManage ? (
                                <Panel title="فقط‌خواندنی"><p className="settlement-muted">برای ساخت صورتحساب یا ثبت دریافت و پرداخت، نقش ویرایشگر لازم است.</p></Panel>
                            ) : options && options.books.length === 0 ? (
                                <Panel title="ثبت صورتحساب"><p className="settlement-note">برای شروع، یک دفتر ریالی در <a className="settlement-link" href="/accounting/journals/new">حسابداری P09</a> بسازید.</p></Panel>
                            ) : null}
                            <Panel title="قرارداد گزارش P11" note="تاریخ‌ها و دفتر برای گزارش ماندهٔ تاریخی ذخیره می‌شوند.">
                                <ul className="settlement-report-notes">
                                    <li>مبنای گزارش: سازمان فعال، دفتر و تاریخ مؤثر.</li>
                                    <li>تخصیص در صورتی از مانده کم می‌شود که ژورنال خزانه ثبت شده و تاریخ رویداد حداکثر تا تاریخ گزارش باشد.</li>
                                    <li>سررسید برای گزارش دیرکرد نگه‌داری می‌شود.</li>
                                </ul>
                            </Panel>
                        </aside>
                    </div>
                    {notice && <p className="settlement-feedback settlement-feedback-success" role="status">{notice}</p>}
                    {error && <p className="settlement-feedback" role="alert">{error}</p>}
                </section>
            );

    if (!workspace) {
        return <main className="app-shell"><div className="app-shell-inner"><section className="state-panel" role={loadState === 'error' ? 'alert' : 'status'}><h1>{loadState === 'loading' ? 'در حال بارگیری تسویه‌ها…' : 'فضای تسویه باز نشد'}</h1>{error && <p>{error}</p>}</section></div></main>;
    }

    return (
        <WorkspaceShell
            title="صورتحساب و تسویه"
            eyebrow="دریافتنی و پرداختنی · P10"
            subtitle="پیوند صورتحساب با سفارش و رویداد تحویل یا رسید؛ تخصیص دریافت و پرداخت به ژورنال و حرکت خزانه"
            activePage="list"
            connectionState={loadState === 'error' || loadState === 'denied' ? 'error' : loadState === 'loading' ? 'loading' : 'ready'}
            connectionLabel={loadState === 'ready' ? 'اتصال آماده است' : loadState === 'loading' ? 'در حال دریافت' : 'نیازمند بررسی'}
            detailHref={undefined}
            toolbar={toolbar}
            forceFallback={forceFallback}
            activeOrganization={workspace.active_organization}
            organizations={workspace.organizations}
            onOrganizationChange={(organizationId) => { void selectOrganization(organizationId).then(() => window.location.reload()).catch((cause) => setError(cause instanceof Error ? cause.message : 'تغییر سازمان انجام نشد.')); }}
            onSignOut={() => { void signOut(); }}
            organizationSwitching={false}
            activeResource="settlements"
            phaseLabel="P10"
        >
            {content}
        </WorkspaceShell>
    );
}
