import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
    addQuoteLine,
    completeActivity,
    confirmQuote,
    convertQuote,
    createActivity,
    createLead,
    createQuote,
    fetchActivity,
    fetchLead,
    fetchLeads,
    fetchOrder,
    fetchOrders,
    fetchOverdueActivities,
    fetchQuote,
    fetchQuotes,
    fetchSalesOptions,
    repriceQuoteLine,
    removeQuoteLine,
    updateQuoteLine,
    type LeadActivity,
    type LeadDetail,
    type LeadSummary,
    type QuoteLine,
    type QuoteSummary,
    type SalesOptions,
    type SalesOrder,
    type SalesQuote,
} from '../api/sales';
import { fetchWorkspaceContext, selectOrganization, signOut, type WorkspaceContext } from '../api/products';
import { GlassButton } from '../components/GlassButton';
import { GlassSearchField } from '../components/GlassSearchField';
import { WorkspaceShell } from '../components/WorkspaceShell';

type Resource = 'leads' | 'follow-ups' | 'quotes' | 'orders';
type Route = { resource: Resource; id: number | null; creating: boolean; leadId: number | null };
type LoadState = 'loading' | 'success' | 'error' | 'denied' | 'missing';

const resourceMeta: Record<Resource, { title: string; eyebrow: string; subtitle: string }> = {
    leads: { title: 'سرنخ‌ها', eyebrow: 'مدیریت ارتباط با مشتری', subtitle: 'سرنخ‌های سازمان فعال و گفت‌وگوهای مرتبط' },
    'follow-ups': { title: 'پیگیری‌های عقب‌افتاده', eyebrow: 'کارهای سررسیدشده', subtitle: 'موعدهای باز که پیش از زمان فعلی سامانه قرار دارند' },
    quotes: { title: 'پیش‌فاکتورها', eyebrow: 'اسناد فروش', subtitle: 'قیمت‌های ثبت‌شده برای پیشنهاد فروش' },
    orders: { title: 'سفارش‌های فروش', eyebrow: 'اسناد فروش', subtitle: 'سفارش‌های تأییدشده و مرتبط با پیش‌فاکتور' },
};

function currentRoute(): Route {
    const path = window.location.pathname.replace(/\/+$/, '') || '/leads';
    const resource = (path.split('/')[1] || 'leads') as Resource;
    const record = path.split('/')[2] ?? null;
    if (record === 'new') {
        const leadId = new URLSearchParams(window.location.search).get('lead_id');
        return { resource, id: null, creating: true, leadId: leadId && /^\d+$/.test(leadId) ? Number(leadId) : null };
    }

    return { resource, id: record && /^\d+$/.test(record) ? Number(record) : null, creating: false, leadId: null };
}

function href(path: string, extra: Record<string, string> = {}): string {
    const [pathname, search = ''] = path.split('?');
    const params = new URLSearchParams(search);
    const current = new URLSearchParams(window.location.search);
    for (const key of ['glass', 'scene']) {
        const value = current.get(key);
        if (value && !params.has(key)) params.set(key, value);
    }
    for (const [key, value] of Object.entries(extra)) params.set(key, value);
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
}

function money(value: string): string {
    try {
        return new Intl.NumberFormat('fa-IR').format(BigInt(value));
    } catch {
        return value;
    }
}

function tomanPrice(value: string): string {
    const [whole, fraction] = value.split('.', 2);
    const localizedWhole = money(whole || '0');
    if (!fraction) return localizedWhole;
    const localizedFraction = fraction.replace(/[0-9]/g, (digit) => String.fromCharCode(0x06f0 + Number(digit)));
    return `${localizedWhole}٫${localizedFraction}`;
}

function dateTime(value: string): string {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

function localDateTime(value: Date): string {
    const offset = value.getTimezoneOffset() * 60_000;
    return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function Empty({ title, children }: { title: string; children: ReactNode }) {
    return <div className="state-panel" role="status"><span className="state-icon empty-icon" aria-hidden="true">—</span><h2>{title}</h2><p>{children}</p></div>;
}

function SalesRegister({
    resource, leads, activities, quotes, orders, filter, onFilterChange, canManage, forceFallback, onComplete, onRefresh,
}: {
    resource: Resource;
    leads: LeadSummary[];
    activities: LeadActivity[];
    quotes: QuoteSummary[];
    orders: SalesOrder[];
    filter: string;
    onFilterChange: (value: string) => void;
    canManage: boolean;
    forceFallback: boolean;
    onComplete: (id: number) => Promise<void>;
    onRefresh: () => void;
}) {
    const needle = filter.trim().toLocaleLowerCase();
    const rows = useMemo(() => {
        if (resource === 'leads') return leads.filter((item) => `${item.code} ${item.title} ${item.customer.name}`.toLocaleLowerCase().includes(needle));
        if (resource === 'quotes') return quotes.filter((item) => `${item.code} ${item.lead?.title ?? ''} ${item.customer?.name ?? ''}`.toLocaleLowerCase().includes(needle));
        if (resource === 'orders') return orders.filter((item) => `${item.code} ${item.lead.title} ${item.customer.name}`.toLocaleLowerCase().includes(needle));
        return activities;
    }, [activities, leads, needle, orders, quotes, resource]);

    return (
        <section className="focus-content sales-register" aria-labelledby="sales-register-title" data-lg-role="focus">
            <div className="surface-heading">
                <div><p className="eyebrow">دفترهای فروش · P05</p><h2 id="sales-register-title">{resourceMeta[resource].title}</h2></div>
                <span className="result-count" aria-live="polite"><bdi dir="ltr">{rows.length}</bdi><span>مورد</span></span>
                {resource === 'follow-ups' && <GlassButton onClick={onRefresh} forceFallback={forceFallback}>تازه‌سازی صف</GlassButton>}
            </div>
            {resource !== 'follow-ups' && <GlassSearchField label={`جست‌وجو در ${resourceMeta[resource].title}`} value={filter} placeholder="کد، عنوان یا مشتری را جست‌وجو کنید" onChange={onFilterChange} />}

            {resource === 'leads' && (rows.length ? (
                <div className="table-scroll-region"><table className="product-table sales-table"><caption className="visually-hidden">سرنخ‌های سازمان فعال</caption>
                    <thead><tr><th scope="col">عنوان</th><th scope="col">کد</th><th scope="col">مشتری</th><th scope="col">پیوندها</th></tr></thead>
                    <tbody>{(rows as LeadSummary[]).map((lead) => <tr key={lead.id}>
                        <th scope="row"><a className="sales-document-link" href={href(`/leads/${lead.id}`)}>{lead.title}</a></th>
                        <td><bdi dir="ltr">{lead.code}</bdi></td><td>{lead.customer.name}</td>
                        <td><a href={href(`/leads/${lead.id}`)}>فعالیت‌ها و پیش‌فاکتورها</a></td>
                    </tr>)}</tbody>
                </table></div>
            ) : <Empty title={needle ? 'سرنخی پیدا نشد' : 'هنوز سرنخی ثبت نشده است'}>برای آغاز مسیر فروش یک سرنخ مشتری بسازید.</Empty>)}

            {resource === 'follow-ups' && (activities.length ? (
                <div className="sales-card-list"><p className="sales-cutoff-note">سررسید عقب‌افتاده یعنی زمان موعد <strong>پیش از زمان فعلی ساعت برنامه</strong> باشد و فعالیت هنوز باز بماند.</p>
                    {activities.map((activity) => <article className="sales-card" id={`activity-${activity.id}`} key={activity.id}>
                        <div className="sales-card-heading"><div><p className="eyebrow">{activity.lead?.code}</p><h3><a href={href(`/follow-ups/${activity.id}`)}>{activity.title}</a></h3></div><span className="sales-state state-overdue">عقب‌افتاده</span></div>
                        <p><a href={href(`/leads/${activity.lead_id}`)}>{activity.lead?.title ?? 'سرنخ'}</a> · موعد <bdi dir="auto">{dateTime(activity.due_at)}</bdi></p>
                        {canManage && <GlassButton variant="tinted" onClick={() => void onComplete(activity.id)} forceFallback={forceFallback}>تکمیل پیگیری</GlassButton>}
                    </article>)}
                </div>
            ) : <Empty title="صف پیگیری عقب‌افتاده خالی است">موعدهای بازِ پیش از زمان فعلی در این صف نمایش داده می‌شوند.</Empty>)}

            {resource === 'quotes' && (rows.length ? (
                <div className="table-scroll-region"><table className="product-table sales-table"><caption className="visually-hidden">پیش‌فاکتورهای سازمان فعال</caption>
                    <thead><tr><th scope="col">پیش‌فاکتور</th><th scope="col">وضعیت</th><th scope="col">سرنخ و مشتری</th><th scope="col">جمع · تومان</th></tr></thead>
                    <tbody>{(rows as QuoteSummary[]).map((quote) => <tr key={quote.id}>
                        <th scope="row"><a className="sales-document-link" href={href(`/quotes/${quote.id}`)}><bdi dir="ltr">{quote.code}</bdi></a></th>
                        <td><span className={`sales-state state-${quote.status}`}>{quote.status === 'draft' ? 'پیش‌نویس' : 'تأییدشده'}</span></td>
                        <td>{quote.lead?.title} · {quote.customer?.name}</td><td><bdi dir="auto">{money(quote.total_toman)}</bdi></td>
                    </tr>)}</tbody>
                </table></div>
            ) : <Empty title={needle ? 'پیش‌فاکتوری پیدا نشد' : 'پیش‌فاکتوری ثبت نشده است'}>از صفحهٔ جزئیات یک سرنخ، پیش‌نویس تازه بسازید.</Empty>)}

            {resource === 'orders' && (rows.length ? (
                <div className="table-scroll-region"><table className="product-table sales-table"><caption className="visually-hidden">سفارش‌های فروش سازمان فعال</caption>
                    <thead><tr><th scope="col">سفارش</th><th scope="col">وضعیت</th><th scope="col">سرنخ و مشتری</th><th scope="col">جمع · تومان</th></tr></thead>
                    <tbody>{(rows as SalesOrder[]).map((order) => <tr key={order.id}>
                        <th scope="row"><a className="sales-document-link" href={href(`/orders/${order.id}`)}><bdi dir="ltr">{order.code}</bdi></a></th>
                        <td><span className="sales-state state-confirmed">تأییدشده</span></td>
                        <td>{order.lead.title} · {order.customer.name}</td><td><bdi dir="auto">{money(order.total_toman)}</bdi></td>
                    </tr>)}</tbody>
                </table></div>
            ) : <Empty title={needle ? 'سفارشی پیدا نشد' : 'سفارشی ثبت نشده است'}>سفارش پس از تأیید یک پیش‌فاکتور ساخته می‌شود.</Empty>)}
        </section>
    );
}

function LeadCreateForm({ options, forceFallback, onCreate }: { options: SalesOptions; forceFallback: boolean; onCreate: (title: string, partyId: number) => Promise<void> }) {
    const [title, setTitle] = useState('');
    const [partyId, setPartyId] = useState('');
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); setSaving(true); setMessage('');
        try { await onCreate(title.trim(), Number(partyId)); } catch (error) { setMessage(error instanceof Error ? error.message : 'ثبت سرنخ انجام نشد.'); }
        finally { setSaving(false); }
    }

    return <section className="focus-content sales-detail" data-lg-role="focus"><a className="back-link" href={href('/leads')}>← فهرست سرنخ‌ها</a>
        <div className="sales-detail-heading"><p className="eyebrow">ثبت فرصت فروش</p><h2>سرنخ تازه</h2></div>
        <form className="sales-form" onSubmit={submit} aria-label="ثبت سرنخ فروش">
            <label className="sales-field"><span>عنوان سرنخ</span><input aria-label="عنوان سرنخ" value={title} onChange={(event) => setTitle(event.currentTarget.value)} maxLength={200} required /></label>
            <label className="sales-field"><span>مشتری واجد نقش مشتری</span><select aria-label="مشتری سرنخ" value={partyId} onChange={(event) => setPartyId(event.currentTarget.value)} required>
                <option value="">انتخاب مشتری</option>{options.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.code}</option>)}
            </select></label>
            {!options.customers.length && <p className="sales-inline-note">برای این سازمان هنوز طرفی با نقش «مشتری» وجود ندارد.</p>}
            <div className="sales-form-actions"><GlassButton type="submit" variant="tinted" disabled={saving || !options.customers.length} forceFallback={forceFallback}>{saving ? 'در حال ثبت' : 'ثبت سرنخ'}</GlassButton><span className="edit-result" role="status" aria-live="polite">{message}</span></div>
        </form>
    </section>;
}

function FollowUpForm({ forceFallback, onCreate }: { forceFallback: boolean; onCreate: (title: string, dueAt: string) => Promise<void> }) {
    const [title, setTitle] = useState('');
    const [dueAt, setDueAt] = useState(() => localDateTime(new Date(Date.now() + 3_600_000)));
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); setSaving(true); setMessage('');
        try { await onCreate(title.trim(), new Date(dueAt).toISOString()); setTitle(''); setMessage('پیگیری ثبت شد.'); }
        catch (error) { setMessage(error instanceof Error ? error.message : 'ثبت پیگیری انجام نشد.'); }
        finally { setSaving(false); }
    }

    return <form className="sales-form sales-activity-form" onSubmit={submit} aria-label="ثبت پیگیری سرنخ">
        <h3>افزودن پیگیری زمان‌دار</h3>
        <label className="sales-field"><span>عنوان پیگیری</span><input aria-label="عنوان پیگیری" value={title} onChange={(event) => setTitle(event.currentTarget.value)} maxLength={200} required /></label>
        <label className="sales-field"><span>زمان سررسید بر اساس ساعت دستگاه</span><input aria-label="زمان سررسید" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.currentTarget.value)} required /></label>
        <div className="sales-form-actions"><GlassButton type="submit" variant="tinted" disabled={saving} forceFallback={forceFallback}>{saving ? 'در حال ثبت' : 'ثبت پیگیری'}</GlassButton><span className="edit-result" role="status" aria-live="polite">{message}</span></div>
    </form>;
}

function LeadDetailPanel({ lead, canManage, forceFallback, onCreateActivity, onComplete }: {
    lead: LeadDetail; canManage: boolean; forceFallback: boolean;
    onCreateActivity: (title: string, dueAt: string) => Promise<void>; onComplete: (id: number) => Promise<void>;
}) {
    return <section className="focus-content sales-detail" data-lg-role="focus">
        <div className="detail-topline"><a className="back-link" href={href('/leads')}>← بازگشت به سرنخ‌ها</a><span className="detail-id">کد <bdi dir="ltr">{lead.code}</bdi></span></div>
        <div className="sales-detail-heading"><p className="eyebrow">سرنخ فروش</p><h2>{lead.title}</h2></div>
        <dl className="detail-fields sales-document-meta"><div className="detail-field"><dt>مشتری</dt><dd><a href={href(`/parties/${lead.customer.id}`)}>{lead.customer.name}</a> · <bdi dir="ltr">{lead.customer.code}</bdi></dd></div></dl>
        <div className="sales-detail-section"><div className="surface-heading"><div><p className="eyebrow">تاریخچهٔ ارتباط</p><h3>فعالیت‌ها و پیگیری‌ها</h3></div></div>
            {lead.activities.length ? <div className="sales-card-list">{lead.activities.map((activity) => <article className="sales-card" key={activity.id}>
                <div className="sales-card-heading"><h4><a href={href(`/follow-ups/${activity.id}`)}>{activity.title}</a></h4><span className={`sales-state ${activity.completed_at ? 'state-completed' : activity.is_overdue ? 'state-overdue' : 'state-open'}`}>{activity.completed_at ? 'تکمیل‌شده' : activity.is_overdue ? 'عقب‌افتاده' : 'باز'}</span></div>
                <p>موعد <bdi dir="auto">{dateTime(activity.due_at)}</bdi>{activity.completed_at && <> · تکمیل <bdi dir="auto">{dateTime(activity.completed_at)}</bdi></>}</p>
                {!activity.completed_at && canManage && <GlassButton onClick={() => void onComplete(activity.id)} forceFallback={forceFallback}>تکمیل</GlassButton>}
            </article>)}</div> : <Empty title="فعالیتی ثبت نشده است">یک پیگیری زمان‌دار برای این سرنخ ثبت کنید.</Empty>}
            {canManage && <FollowUpForm forceFallback={forceFallback} onCreate={onCreateActivity} />}
        </div>
        <div className="sales-detail-section"><div className="surface-heading"><div><p className="eyebrow">اسناد مرتبط</p><h3>پیش‌فاکتورها</h3></div>
            {canManage && <a className="master-toolbar-create" href={href('/quotes/new', { lead_id: String(lead.id) })}>پیش‌نویس تازه</a>}
        </div>
            {lead.quotes.length ? <div className="sales-card-list">{lead.quotes.map((quote) => <article className="sales-card sales-card-compact" key={quote.id}>
                <a className="sales-document-link" href={href(`/quotes/${quote.id}`)}><bdi dir="ltr">{quote.code}</bdi> · {quote.status === 'draft' ? 'پیش‌نویس' : 'تأییدشده'}</a>
                <span><bdi dir="auto">{money(quote.total_toman)}</bdi> تومان</span>
                {quote.order && <a href={href(`/orders/${quote.order.id}`)}>سفارش {quote.order.code}</a>}
            </article>)}</div> : <Empty title="پیش‌فاکتوری ثبت نشده است">از همین سرنخ، پیش‌نویس فروش ایجاد کنید.</Empty>}
        </div>
    </section>;
}

function QuoteCreateForm({ lead, options, forceFallback, onCreate }: {
    lead: LeadDetail; options: SalesOptions; forceFallback: boolean; onCreate: (priceListId: number) => Promise<void>;
}) {
    const [priceListId, setPriceListId] = useState('');
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);
    useEffect(() => { if (!priceListId && options.price_lists[0]) setPriceListId(String(options.price_lists[0].id)); }, [options.price_lists, priceListId]);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); setSaving(true); setMessage('');
        try { await onCreate(Number(priceListId)); } catch (error) { setMessage(error instanceof Error ? error.message : 'ساخت پیش‌نویس انجام نشد.'); }
        finally { setSaving(false); }
    }

    return <section className="focus-content sales-detail" data-lg-role="focus">
        <div className="detail-topline"><a className="back-link" href={href(`/leads/${lead.id}`)}>← سرنخ {lead.code}</a></div>
        <div className="sales-detail-heading"><p className="eyebrow">سرنخ ← پیش‌فاکتور</p><h2>پیش‌نویس برای {lead.title}</h2></div>
        <p className="sales-inline-note">مشتری از سرنخ گرفته می‌شود: {lead.customer.name}</p>
        <form className="sales-form" onSubmit={submit} aria-label="ساخت پیش‌نویس پیش‌فاکتور">
            <label className="sales-field"><span>فهرست قیمت</span><select aria-label="فهرست قیمت" value={priceListId} onChange={(event) => setPriceListId(event.currentTarget.value)} required>
                <option value="">انتخاب فهرست قیمت</option>{options.price_lists.map((list) => <option key={list.id} value={list.id}>{list.name} · {list.code}</option>)}
            </select></label>
            <div className="sales-form-actions"><GlassButton type="submit" variant="tinted" disabled={saving || !priceListId} forceFallback={forceFallback}>{saving ? 'در حال ساخت' : 'ساخت پیش‌نویس'}</GlassButton><span className="edit-result" role="status" aria-live="polite">{message}</span></div>
        </form>
    </section>;
}

function QuoteLineEditor({ line, canManage, forceFallback, onUpdate, onReprice, onRemove }: {
    line: QuoteLine; canManage: boolean; forceFallback: boolean;
    onUpdate: (id: number, quantity: string, discount: string) => Promise<void>;
    onReprice: (id: number) => Promise<void>; onRemove: (id: number) => Promise<void>;
}) {
    const [quantity, setQuantity] = useState(line.quantity);
    const [discount, setDiscount] = useState(line.discount_percent);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); setBusy(true); setMessage('');
        try { await onUpdate(line.id, quantity, discount); setMessage('مقدار و تخفیف ذخیره شد؛ قیمت ثبت‌شده حفظ شد.'); }
        catch (error) { setMessage(error instanceof Error ? error.message : 'ویرایش سطر انجام نشد.'); }
        finally { setBusy(false); }
    }

    async function run(action: (id: number) => Promise<void>, success: string) {
        setBusy(true); setMessage('');
        try { await action(line.id); setMessage(success); }
        catch (error) { setMessage(error instanceof Error ? error.message : 'عملیات سطر انجام نشد.'); }
        finally { setBusy(false); }
    }

    return <article className="sales-line-card">
        <div className="sales-line-heading"><div><h4>{line.product_name}</h4><p><bdi dir="ltr">{line.product_code}</bdi> · واحد پایه: {line.unit.name} ({line.unit.symbol})</p></div><strong><bdi dir="auto">{money(line.line_net_toman)}</bdi> تومان</strong></div>
        <dl className="sales-line-facts"><div><dt>مقدار</dt><dd><bdi dir="ltr">{line.quantity}</bdi> {line.unit.symbol}</dd></div><div><dt>قیمت واحد · تومان</dt><dd><bdi dir="auto">{tomanPrice(line.unit_price_toman)}</bdi></dd></div><div><dt>تخفیف</dt><dd><bdi dir="ltr">{line.discount_percent}%</bdi></dd></div><div><dt>خالص سطر</dt><dd><bdi dir="auto">{money(line.line_net_toman)}</bdi> تومان</dd></div></dl>
        {canManage && <>
            <form className="sales-line-edit" onSubmit={save} aria-label={`ویرایش سطر ${line.product_code}`}>
                <label className="sales-field"><span>مقدار</span><input aria-label={`مقدار ${line.product_code}`} inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.currentTarget.value)} /></label>
                <label className="sales-field"><span>تخفیف ٪</span><input aria-label={`تخفیف ${line.product_code}`} inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.currentTarget.value)} /></label>
                <GlassButton type="submit" disabled={busy} forceFallback={forceFallback}>ذخیرهٔ مقدار و تخفیف</GlassButton>
                <GlassButton type="button" disabled={busy} onClick={() => void run(onReprice, 'قیمت تازه ثبت شد.')} forceFallback={forceFallback}>بازخوانی قیمت</GlassButton>
                <button className="sales-text-button" type="button" disabled={busy} onClick={() => void run(onRemove, 'سطر حذف شد.')}>حذف سطر</button>
                <span className="edit-result" role="status" aria-live="polite">{message}</span>
            </form>
            <span className="sales-inline-note">تغییر مقدار یا تخفیف، قیمت ثبت‌شده را عوض نمی‌کند؛ فقط «بازخوانی قیمت» آن را از فهرست انتخاب‌شده تازه می‌کند.</span>
        </>}
    </article>;
}

function AddQuoteLineForm({ quote, options, forceFallback, onAdd }: {
    quote: SalesQuote; options: SalesOptions; forceFallback: boolean;
    onAdd: (productId: number, quantity: string, discount: string) => Promise<void>;
}) {
    const [productId, setProductId] = useState('');
    const [quantity, setQuantity] = useState('1.000');
    const [discount, setDiscount] = useState('0.00');
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); setSaving(true); setMessage('');
        try { await onAdd(Number(productId), quantity, discount); setMessage('سطر با قیمت همان لحظه ثبت شد.'); }
        catch (error) { setMessage(error instanceof Error ? error.message : 'افزودن سطر انجام نشد.'); }
        finally { setSaving(false); }
    }

    return <form className="sales-form sales-add-line-form" onSubmit={submit} aria-label="افزودن سطر پیش‌فاکتور">
        <h3>افزودن کالا از فهرست «{quote.price_list.name}»</h3>
        <label className="sales-field"><span>کالا</span><select aria-label="کالای سطر" value={productId} onChange={(event) => setProductId(event.currentTarget.value)} required>
            <option value="">انتخاب کالا</option>{options.products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.code}{product.base_unit ? ` · ${product.base_unit.name}` : ' · واحد پایه نامشخص'}</option>)}
        </select></label>
        <label className="sales-field"><span>مقدار (حداکثر سه رقم اعشار)</span><input aria-label="مقدار سطر تازه" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.currentTarget.value)} required /></label>
        <label className="sales-field"><span>تخفیف درصدی (۰ تا ۱۰۰)</span><input aria-label="تخفیف سطر تازه" inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.currentTarget.value)} required /></label>
        <div className="sales-form-actions"><GlassButton type="submit" variant="tinted" disabled={saving || !productId} forceFallback={forceFallback}>{saving ? 'در حال افزودن' : 'افزودن سطر'}</GlassButton><span className="edit-result" role="status" aria-live="polite">{message}</span></div>
    </form>;
}

function QuoteDetailPanel({ quote, options, canManage, forceFallback, onRefresh, onUpdateLine, onRepriceLine, onRemoveLine, onAddLine, onConfirm, onConvert }: {
    quote: SalesQuote; options: SalesOptions; canManage: boolean; forceFallback: boolean; onRefresh: () => void;
    onUpdateLine: (id: number, quantity: string, discount: string) => Promise<void>; onRepriceLine: (id: number) => Promise<void>;
    onRemoveLine: (id: number) => Promise<void>; onAddLine: (productId: number, quantity: string, discount: string) => Promise<void>;
    onConfirm: () => Promise<void>; onConvert: () => Promise<void>;
}) {
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    async function run(action: () => Promise<void>, success: string) {
        setBusy(true); setMessage('');
        try { await action(); setMessage(success); }
        catch (error) { setMessage(error instanceof Error ? error.message : 'عملیات سند انجام نشد.'); }
        finally { setBusy(false); }
    }

    return <section className="focus-content sales-detail" data-lg-role="focus">
        <div className="detail-topline"><a className="back-link" href={href('/quotes')}>← فهرست پیش‌فاکتورها</a><span className="detail-id">کد <bdi dir="ltr">{quote.code}</bdi></span></div>
        <div className="sales-detail-heading"><div><p className="eyebrow">پیش‌فاکتور · <span className={`sales-state state-${quote.status}`}>{quote.status === 'draft' ? 'پیش‌نویس' : 'تأییدشده'}</span></p><h2>{quote.lead.title}</h2></div></div>
        <dl className="detail-fields sales-document-meta">
            <div className="detail-field"><dt>سرنخ</dt><dd><a href={href(`/leads/${quote.lead.id}`)}><bdi dir="ltr">{quote.lead.code}</bdi> · {quote.lead.title}</a></dd></div>
            <div className="detail-field"><dt>مشتری</dt><dd><a href={href(`/parties/${quote.customer.id}`)}>{quote.customer.name}</a> · <bdi dir="ltr">{quote.customer.code}</bdi></dd></div>
            <div className="detail-field"><dt>فهرست قیمت</dt><dd>{quote.price_list.name} · <bdi dir="ltr">{quote.price_list.code}</bdi></dd></div>
            <div className="detail-field"><dt>وضعیت</dt><dd>{quote.status === 'draft' ? 'پیش‌نویس' : `تأییدشده · ${quote.confirmed_at ? dateTime(quote.confirmed_at) : ''}`}</dd></div>
        </dl>
        <div className="sales-detail-section"><div className="surface-heading"><div><p className="eyebrow">قیمت ثبت‌شده در سند</p><h3>سطرهای پیش‌فاکتور</h3></div><button className="sales-text-button" type="button" onClick={onRefresh}>تازه‌سازی</button></div>
            {quote.lines.length ? <div className="sales-line-list">{quote.lines.map((line) => <QuoteLineEditor key={line.id} line={line} canManage={canManage && quote.status === 'draft'} forceFallback={forceFallback}
                onUpdate={(id, quantity, discount) => onUpdateLine(id, quantity, discount)} onReprice={onRepriceLine} onRemove={onRemoveLine} />)}</div>
                : <Empty title="سطر کالا ندارد">از فهرست منتخب، کالای قیمت‌دار با واحد پایه اضافه کنید.</Empty>}
            {canManage && quote.status === 'draft' && <AddQuoteLineForm quote={quote} options={options} forceFallback={forceFallback} onAdd={onAddLine} />}
        </div>
        <div className="sales-total"><span>جمع پیش‌فاکتور</span><strong><bdi dir="auto">{money(quote.total_toman)}</bdi> تومان</strong></div>
        {quote.status === 'draft' && canManage && <div className="sales-transition-actions"><GlassButton variant="tinted" disabled={busy || quote.lines.length === 0} onClick={() => void run(onConfirm, 'پیش‌فاکتور تأیید شد.')} forceFallback={forceFallback}>تأیید پیش‌فاکتور</GlassButton><span className="sales-inline-note">پس از تأیید، سطرها و قیمت‌های ذخیره‌شده ثابت می‌مانند.</span></div>}
        {quote.status === 'confirmed' && quote.order && <p className="sales-order-link"><a href={href(`/orders/${quote.order.id}`)}>سفارش مرتبط {quote.order.code} را ببینید ←</a></p>}
        {quote.status === 'confirmed' && !quote.order && canManage && <div className="sales-transition-actions"><GlassButton variant="tinted" disabled={busy} onClick={() => void run(onConvert, 'سفارش ساخته شد.')} forceFallback={forceFallback}>تبدیل به سفارش تأییدشده</GlassButton><span className="sales-inline-note">تبدیل دوباره همین سفارش را برمی‌گرداند.</span></div>}
        <p className="edit-result" role="status" aria-live="polite">{message}</p>
    </section>;
}

function ActivityDetailPanel({ activity, canManage, forceFallback, onComplete }: { activity: LeadActivity; canManage: boolean; forceFallback: boolean; onComplete: (id: number) => Promise<void> }) {
    const [message, setMessage] = useState('');
    async function complete() { try { await onComplete(activity.id); setMessage('پیگیری تکمیل شد.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'تکمیل پیگیری انجام نشد.'); } }
    return <section className="focus-content sales-detail" data-lg-role="focus">
        <div className="detail-topline"><a className="back-link" href={href('/follow-ups')}>← صف پیگیری عقب‌افتاده</a><span className={`sales-state ${activity.completed_at ? 'state-completed' : activity.is_overdue ? 'state-overdue' : 'state-open'}`}>{activity.completed_at ? 'تکمیل‌شده' : activity.is_overdue ? 'عقب‌افتاده' : 'باز'}</span></div>
        <div className="sales-detail-heading"><p className="eyebrow">فعالیت سرنخ · <bdi dir="ltr">{activity.lead?.code}</bdi></p><h2>{activity.title}</h2></div>
        <dl className="detail-fields sales-document-meta"><div className="detail-field"><dt>سرنخ</dt><dd><a href={href(`/leads/${activity.lead_id}`)}>{activity.lead?.title}</a></dd></div><div className="detail-field"><dt>موعد</dt><dd><bdi dir="auto">{dateTime(activity.due_at)}</bdi></dd></div>{activity.completed_at && <div className="detail-field"><dt>تکمیل</dt><dd><bdi dir="auto">{dateTime(activity.completed_at)}</bdi></dd></div>}</dl>
        {canManage && !activity.completed_at && <GlassButton variant="tinted" onClick={() => void complete()} forceFallback={forceFallback}>تکمیل پیگیری</GlassButton>}
        <p className="edit-result" role="status" aria-live="polite">{message}</p>
    </section>;
}

function OrderDetailPanel({ order }: { order: SalesOrder }) {
    return <section className="focus-content sales-detail" data-lg-role="focus">
        <div className="detail-topline"><a className="back-link" href={href('/orders')}>← سفارش‌های فروش</a><span className="detail-id">کد <bdi dir="ltr">{order.code}</bdi></span></div>
        <div className="sales-detail-heading"><p className="eyebrow">سفارش فروش · تأییدشده</p><h2>{order.lead.title}</h2></div>
        <dl className="detail-fields sales-document-meta">
            <div className="detail-field"><dt>پیش‌فاکتور مبدأ</dt><dd><a href={href(`/quotes/${order.source_quote.id}`)}><bdi dir="ltr">{order.source_quote.code}</bdi></a></dd></div>
            <div className="detail-field"><dt>سرنخ</dt><dd><a href={href(`/leads/${order.lead.id}`)}><bdi dir="ltr">{order.lead.code}</bdi> · {order.lead.title}</a></dd></div>
            <div className="detail-field"><dt>مشتری</dt><dd><a href={href(`/parties/${order.customer.id}`)}>{order.customer.name}</a> · <bdi dir="ltr">{order.customer.code}</bdi></dd></div>
            <div className="detail-field"><dt>فهرست قیمت زمان پیش‌نویس</dt><dd>{order.price_list.name} · <bdi dir="ltr">{order.price_list.code}</bdi></dd></div>
            <div className="detail-field"><dt>تأیید</dt><dd><bdi dir="auto">{dateTime(order.confirmed_at)}</bdi></dd></div>
        </dl>
        <div className="sales-detail-section"><div className="surface-heading"><div><p className="eyebrow">تصویر ذخیره‌شدهٔ پیش‌فاکتور</p><h3>سطرهای سفارش</h3></div></div>
            <div className="sales-line-list">{order.lines.map((line) => <article className="sales-line-card" key={line.id}>
                <div className="sales-line-heading"><div><h4>{line.product_name}</h4><p><bdi dir="ltr">{line.product_code}</bdi> · {line.unit.name} ({line.unit.symbol})</p></div><strong><bdi dir="auto">{money(line.line_net_toman)}</bdi> تومان</strong></div>
                <dl className="sales-line-facts"><div><dt>مقدار</dt><dd><bdi dir="ltr">{line.quantity}</bdi></dd></div><div><dt>قیمت واحد · تومان</dt><dd><bdi dir="auto">{tomanPrice(line.unit_price_toman)}</bdi></dd></div><div><dt>تخفیف</dt><dd><bdi dir="ltr">{line.discount_percent}%</bdi></dd></div><div><dt>خالص سطر</dt><dd><bdi dir="auto">{money(line.line_net_toman)}</bdi> تومان</dd></div></dl>
                <p className="sales-inline-note">پیوند سطر مبدأ: <bdi dir="ltr">{line.source_quote_line_id}</bdi></p>
            </article>)}</div>
        </div>
        <div className="sales-total"><span>جمع سفارش</span><strong><bdi dir="auto">{money(order.total_toman)}</bdi> تومان</strong></div>
    </section>;
}

export function SalesScreen() {
    const route = currentRoute();
    const [context, setContext] = useState<WorkspaceContext | null>(null);
    const [options, setOptions] = useState<SalesOptions>({ customers: [], products: [], price_lists: [] });
    const [loadState, setLoadState] = useState<LoadState>('loading');
    const [attempt, setAttempt] = useState(0);
    const [filter, setFilter] = useState('');
    const [leads, setLeads] = useState<LeadSummary[]>([]);
    const [activities, setActivities] = useState<LeadActivity[]>([]);
    const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
    const [orders, setOrders] = useState<SalesOrder[]>([]);
    const [lead, setLead] = useState<LeadDetail | null>(null);
    const [activity, setActivity] = useState<LeadActivity | null>(null);
    const [quote, setQuote] = useState<SalesQuote | null>(null);
    const [order, setOrder] = useState<SalesOrder | null>(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [switching, setSwitching] = useState(false);
    const forceFallback = new URLSearchParams(window.location.search).get('glass') === 'fallback';

    useEffect(() => {
        const controller = new AbortController();
        Promise.all([fetchWorkspaceContext(controller.signal), fetchSalesOptions(controller.signal)])
            .then(([workspace, salesOptions]) => { setContext(workspace); setOptions(salesOptions); })
            .catch((error: unknown) => { if (!controller.signal.aborted) { setLoadState(error instanceof Error && 'status' in error && error.status === 403 ? 'denied' : 'error'); setErrorMessage(error instanceof Error ? error.message : 'فضای فروش دریافت نشد.'); } });
        return () => controller.abort();
    }, [attempt]);

    useEffect(() => {
        const controller = new AbortController();
        setLoadState('loading'); setErrorMessage('');
        setLead(null); setActivity(null); setQuote(null); setOrder(null);
        const search = route.resource === 'leads' || route.resource === 'quotes' || route.resource === 'orders' ? filter : '';
        const load = async () => {
            try {
                if (route.resource === 'leads' && route.creating) {
                    setLoadState('success'); return;
                }
                if (route.resource === 'leads' && route.id !== null) {
                    setLead(await fetchLead(route.id, controller.signal));
                } else if (route.resource === 'leads') {
                    setLeads(await fetchLeads(search, controller.signal));
                } else if (route.resource === 'follow-ups' && route.id !== null) {
                    setActivity(await fetchActivity(route.id, controller.signal));
                } else if (route.resource === 'follow-ups') {
                    setActivities(await fetchOverdueActivities(controller.signal));
                } else if (route.resource === 'quotes' && route.creating && route.leadId !== null) {
                    setLead(await fetchLead(route.leadId, controller.signal));
                } else if (route.resource === 'quotes' && route.id !== null) {
                    setQuote(await fetchQuote(route.id, controller.signal));
                } else if (route.resource === 'quotes') {
                    setQuotes(await fetchQuotes(search, controller.signal));
                } else if (route.resource === 'orders' && route.id !== null) {
                    setOrder(await fetchOrder(route.id, controller.signal));
                } else if (route.resource === 'orders') {
                    setOrders(await fetchOrders(search, controller.signal));
                }
                if (!controller.signal.aborted) setLoadState('success');
            } catch (error) {
                if (controller.signal.aborted) return;
                if (error instanceof Error && 'status' in error && (error.status === 403 || error.status === 401)) setLoadState('denied');
                else if (error instanceof Error && 'status' in error && error.status === 404) setLoadState('missing');
                else setLoadState('error');
                setErrorMessage(error instanceof Error ? error.message : 'دریافت اطلاعات انجام نشد.');
            }
        };
        void load();
        return () => controller.abort();
    }, [attempt, filter, route.creating, route.id, route.leadId, route.resource]);

    const canManage = context?.capabilities.sales.manage ?? false;
    const meta = resourceMeta[route.resource];
    const pageIsDetail = route.id !== null || route.creating;
    const toolbar = <div className="sales-toolbar">
        {canManage && <a className="master-toolbar-create" href={href('/leads/new')}>سرنخ تازه</a>}
        <a className="sales-toolbar-link" href={href('/follow-ups')}>صف پیگیری</a>
        <a className="sales-toolbar-link" href={href('/quotes')}>پیش‌فاکتورها</a>
        <a className="sales-toolbar-link" href={href('/orders')}>سفارش‌ها</a>
    </div>;

    async function changeOrganization(organizationId: number) {
        setSwitching(true);
        try { await selectOrganization(organizationId); window.location.reload(); }
        finally { setSwitching(false); }
    }

    async function submitLead(title: string, partyId: number) {
        const created = await createLead({ title, party_id: partyId });
        window.location.assign(href(`/leads/${created.id}`));
    }

    async function addActivity(title: string, dueAt: string) {
        if (route.resource !== 'leads' || route.id === null) throw new Error('سرنخ انتخاب‌شده معتبر نیست.');
        await createActivity(route.id, { title, due_at: dueAt });
        setAttempt((value) => value + 1);
    }

    async function complete(id: number) {
        await completeActivity(id);
        setActivities((current) => current.filter((item) => item.id !== id));
        setAttempt((value) => value + 1);
    }

    async function submitQuote(priceListId: number) {
        if (route.leadId === null) throw new Error('پیش‌نویس باید از یک سرنخ ساخته شود.');
        const created = await createQuote(route.leadId, priceListId);
        window.location.assign(href(`/quotes/${created.id}`));
    }

    async function refreshQuote() { setAttempt((value) => value + 1); }
    async function addLine(productId: number, quantity: string, discount: string) {
        if (!quote) return;
        await addQuoteLine(quote.id, { product_id: productId, quantity, discount }); await refreshQuote();
    }
    async function updateLine(id: number, quantity: string, discount: string) {
        if (!quote) return;
        await updateQuoteLine(quote.id, id, { quantity, discount }); await refreshQuote();
    }
    async function repriceLine(id: number) { if (quote) { await repriceQuoteLine(quote.id, id); await refreshQuote(); } }
    async function removeLine(id: number) { if (quote) { await removeQuoteLine(quote.id, id); await refreshQuote(); } }
    async function confirmCurrentQuote() { if (quote) { await confirmQuote(quote.id); await refreshQuote(); } }
    async function convertCurrentQuote() {
        if (!quote) return;
        const result = await convertQuote(quote.id);
        window.location.assign(href(`/orders/${result.order.id}`));
    }

    let content: ReactNode;
    if (loadState === 'loading' || context === null) {
        content = <section className="focus-content" data-lg-role="focus" aria-busy="true"><div className="state-panel" role="status"><span className="loading-mark" aria-hidden="true" /><h2>در حال دریافت فضای فروش</h2><p>فهرست‌ها از سازمان فعال خوانده می‌شوند.</p></div></section>;
    } else if (loadState === 'denied') {
        content = <section className="focus-content" data-lg-role="focus"><div className="state-panel denied-card" role="alert"><h2>دسترسی مجاز نیست</h2><p>{errorMessage || 'عضویت سازمان فعال را بررسی کنید.'}</p></div></section>;
    } else if (loadState === 'missing') {
        content = <section className="focus-content" data-lg-role="focus"><div className="state-panel unknown-panel" role="status"><h2>سند در سازمان فعال پیدا نشد</h2><p>این شناسه در اطلاعات سازمان فعال وجود ندارد.</p><a className="detail-register-link" href={href(`/${route.resource}`)}>بازگشت به فهرست</a></div></section>;
    } else if (loadState === 'error') {
        content = <section className="focus-content" data-lg-role="focus"><div className="state-panel error-panel" role="alert"><h2>دریافت اطلاعات انجام نشد</h2><p>{errorMessage || 'اتصال محلی را بررسی کنید.'}</p><GlassButton variant="tinted" onClick={() => setAttempt((value) => value + 1)} forceFallback={forceFallback}>تلاش دوباره</GlassButton></div></section>;
    } else if (route.creating && !canManage) {
        content = <section className="focus-content" data-lg-role="focus"><div className="state-panel denied-card" role="alert"><h2>اجازهٔ ویرایش فروش ندارید</h2><p>ثبت و تغییر اسناد فروش برای ویرایشگر سازمان فعال در دسترس است.</p></div></section>;
    } else if (route.resource === 'leads' && route.creating) {
        content = <LeadCreateForm options={options} forceFallback={forceFallback} onCreate={submitLead} />;
    } else if (route.resource === 'leads' && route.id !== null && lead) {
        content = <LeadDetailPanel lead={lead} canManage={canManage} forceFallback={forceFallback} onCreateActivity={addActivity} onComplete={complete} />;
    } else if (route.resource === 'quotes' && route.creating && lead) {
        content = <QuoteCreateForm lead={lead} options={options} forceFallback={forceFallback} onCreate={submitQuote} />;
    } else if (route.resource === 'quotes' && route.creating) {
        content = <section className="focus-content" data-lg-role="focus"><div className="state-panel" role="alert"><h2>سرنخ برای پیش‌نویس مشخص نیست</h2><p>پیش‌فاکتور باید از صفحهٔ یک سرنخ ساخته شود.</p><a className="detail-register-link" href={href('/leads')}>بازگشت به سرنخ‌ها</a></div></section>;
    } else if (route.resource === 'quotes' && route.id !== null && quote) {
        content = <QuoteDetailPanel quote={quote} options={options} canManage={canManage} forceFallback={forceFallback} onRefresh={refreshQuote}
            onUpdateLine={updateLine} onRepriceLine={repriceLine} onRemoveLine={removeLine} onAddLine={addLine} onConfirm={confirmCurrentQuote} onConvert={convertCurrentQuote} />;
    } else if (route.resource === 'follow-ups' && route.id !== null && activity) {
        content = <ActivityDetailPanel activity={activity} canManage={canManage} forceFallback={forceFallback} onComplete={complete} />;
    } else if (route.resource === 'orders' && route.id !== null && order) {
        content = <OrderDetailPanel order={order} />;
    } else {
        content = <SalesRegister resource={route.resource} leads={leads} activities={activities} quotes={quotes} orders={orders} filter={filter} onFilterChange={setFilter}
            canManage={canManage} forceFallback={forceFallback} onComplete={complete} onRefresh={() => setAttempt((value) => value + 1)} />;
    }

    if (context === null) return <main className="app-shell" data-lg-role="stage">{content}</main>;

    return <WorkspaceShell title={meta.title} eyebrow={meta.eyebrow} subtitle={meta.subtitle} activePage={pageIsDetail ? 'detail' : 'list'}
        activeResource={route.resource} phaseLabel="P05" connectionState={loadState === 'error' || loadState === 'missing' || loadState === 'denied' ? 'error' : loadState === 'loading' ? 'loading' : 'ready'}
        connectionLabel={loadState === 'success' ? 'دادهٔ فروش دریافت شد' : loadState === 'loading' ? 'در حال دریافت داده' : 'نیاز به بررسی'} toolbar={toolbar}
        forceFallback={forceFallback} activeOrganization={context.active_organization} organizations={context.organizations} onOrganizationChange={changeOrganization}
        onSignOut={signOut} organizationSwitching={switching}>
        {content}
    </WorkspaceShell>;
}
