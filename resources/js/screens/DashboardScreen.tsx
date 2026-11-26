import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
    DashboardApiError,
    fetchDashboardOptions,
    fetchDashboardRecords,
    fetchDashboardSummary,
    type DashboardMetricSlug,
    type DashboardOptions,
    type DashboardRecordPage,
    type DashboardSummary,
    type DisplayCurrency,
} from '../api/dashboard';
import { fetchWorkspaceContext, selectOrganization, signOut, type WorkspaceContext } from '../api/products';
import { AccessDeniedScreen } from './AccessDeniedScreen';
import { WorkspaceShell } from '../components/WorkspaceShell';

type LoadState = 'loading' | 'ready' | 'error' | 'denied';

const metricDetails: Record<DashboardMetricSlug, { title: string; explanation: string }> = {
    'net-sales': {
        title: 'صورتحساب‌های فروش خالص',
        explanation: 'صورتحساب مشتری ثبت‌شده در دفتر انتخابی با تاریخ مؤثر تا پایان روز گزارش.',
    },
    'overdue-receivables': {
        title: 'دریافتنی‌های سررسیدگذشته',
        explanation: 'صورتحساب‌های مشتری با سررسید پیش از روز گزارش و ماندهٔ مثبت پس از تخصیص‌های ثبت‌شده تا همان روز.',
    },
    'available-stock': {
        title: 'موجودی قابل استفاده',
        explanation: 'حرکت‌های انبار و رزروهای ایجادشده تا پایان روز گزارش؛ تحویل و آزادسازی تا همان لحظه از رزرو کم می‌شوند.',
    },
    'pending-purchase-approvals': {
        title: 'درخواست‌های خرید در انتظار تأیید',
        explanation: 'درخواست‌های ارسال‌شده تا پایان روز گزارش که در همان لحظه هنوز تأیید نشده بودند.',
    },
};

const metricLabels: Record<DashboardMetricSlug, string> = {
    'net-sales': 'فروش خالص',
    'overdue-receivables': 'دریافتنی سررسیدگذشته',
    'available-stock': 'موجودی قابل استفاده',
    'pending-purchase-approvals': 'در انتظار تأیید',
};

function metricFromUrl(): DashboardMetricSlug | null {
    const value = new URLSearchParams(window.location.search).get('metric');

    return value && value in metricDetails ? value as DashboardMetricSlug : null;
}

function positivePageFromUrl(): number {
    const value = Number(new URLSearchParams(window.location.search).get('page') ?? '1');

    return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

function dateInTimeZone(timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));

    return `${value.year}-${value.month}-${value.day}`;
}

function isDenied(cause: unknown): boolean {
    if (cause instanceof DashboardApiError) return cause.status === 401 || cause.status === 403;
    if (typeof cause === 'object' && cause !== null && 'status' in cause) {
        const status = Number((cause as { status: unknown }).status);
        return status === 401 || status === 403;
    }

    return false;
}

function exactNumber(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    const [whole, fraction] = String(value).split('.', 2);
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
    const persian = grouped.replace(/[0-9]/g, (digit) => String.fromCharCode(0x06f0 + Number(digit)));

    return fraction ? `${persian}٫${fraction.replace(/[0-9]/g, (digit) => String.fromCharCode(0x06f0 + Number(digit)))}` : persian;
}

function countText(value: number): string {
    return new Intl.NumberFormat('fa-IR').format(value);
}

function queryHref(filters: { bookId: number | null; asOfDate: string; currency: DisplayCurrency }, metric?: DashboardMetricSlug, page = 1): string {
    const params = new URLSearchParams();
    if (filters.bookId !== null) params.set('book_id', String(filters.bookId));
    if (filters.asOfDate) params.set('as_of_date', filters.asOfDate);
    params.set('currency', filters.currency);
    if (metric) params.set('metric', metric);
    if (page > 1) params.set('page', String(page));
    const query = params.toString();

    return query ? `/dashboard?${query}` : '/dashboard';
}

function Toolbar({
    options,
    bookId,
    asOfDate,
    currency,
    disabled,
    onBookChange,
    onDateChange,
    onCurrencyChange,
}: {
    options: DashboardOptions;
    bookId: number | null;
    asOfDate: string;
    currency: DisplayCurrency;
    disabled: boolean;
    onBookChange: (value: number) => void;
    onDateChange: (value: string) => void;
    onCurrencyChange: (value: DisplayCurrency) => void;
}) {
    return (
        <div className="p11-toolbar" data-lg-role="rail">
            <label className="p11-control" htmlFor="p11-book">
                <span>دفتر مالی</span>
                <select id="p11-book" value={bookId ?? ''} onChange={(event) => onBookChange(Number(event.currentTarget.value))} disabled={disabled || options.books.length === 0}>
                    {options.books.map((book) => <option key={book.id} value={book.id}>{book.name} · {book.code}</option>)}
                </select>
            </label>
            <label className="p11-control" htmlFor="p11-as-of-date">
                <span>تاریخ گزارش</span>
                <input id="p11-as-of-date" type="date" value={asOfDate} onChange={(event) => onDateChange(event.currentTarget.value)} disabled={disabled} />
            </label>
            <label className="p11-control" htmlFor="p11-currency">
                <span>نمایش مبلغ</span>
                <select id="p11-currency" value={currency} onChange={(event) => onCurrencyChange(event.currentTarget.value as DisplayCurrency)} disabled={disabled}>
                    <option value="IRR">ریال</option>
                    <option value="TOMAN">تومان</option>
                </select>
            </label>
        </div>
    );
}

function Tile({
    slug,
    title,
    value,
    unit,
    note,
    href,
    count,
    className = '',
}: {
    slug: DashboardMetricSlug;
    title: string;
    value: ReactNode;
    unit?: string;
    note: ReactNode;
    href: string;
    count?: number;
    className?: string;
}) {
    return (
        <article className={`p11-tile ${className}`.trim()} data-testid={`p11-tile-${slug}`}>
            <div className="p11-tile-heading">
                <span className="p11-tile-index" aria-hidden="true">{slug === 'net-sales' ? '۰۱' : slug === 'overdue-receivables' ? '۰۲' : slug === 'available-stock' ? '۰۳' : '۰۴'}</span>
                <h2>{title}</h2>
            </div>
            <div className="p11-tile-value">
                {value}{unit && <span className="p11-tile-unit">{unit}</span>}
            </div>
            {count !== undefined && <p className="p11-tile-count">{countText(count)} ردیف منبع</p>}
            <p className="p11-tile-note">{note}</p>
            <a className="p11-drill-link" href={href} aria-label={`نمایش ردیف‌های منبع ${title}`}>
                <span>دیدن ردیف‌های منبع</span><span aria-hidden="true">←</span>
            </a>
        </article>
    );
}

function DetailTable({ page, currency }: { page: DashboardRecordPage; currency: DisplayCurrency }) {
    const rows = page.records;

    if (rows.length === 0) {
        return <p className="p11-empty" role="status">برای این تاریخ و فیلترها ردیفی در این گروه نیست.</p>;
    }

    if (page.metric === 'net-sales') {
        return (
            <div className="p11-table-wrap"><table className="p11-table">
                <thead><tr><th scope="col">صورتحساب</th><th scope="col">مشتری</th><th scope="col">تاریخ مؤثر</th><th scope="col">مبلغ ({currency === 'IRR' ? 'ریال' : 'تومان'})</th><th scope="col">سفارش فروش</th></tr></thead>
                <tbody>{rows.map((row) => {
                    const source = row.source as { href?: string; code?: string } | undefined;
                    return <tr key={String(row.id)}>
                        <th scope="row"><bdi dir="ltr">{String(row.code)}</bdi></th>
                        <td>{String(row.party_name ?? '—')}</td>
                        <td><bdi dir="ltr">{String(row.effective_on)}</bdi></td>
                        <td><bdi dir="ltr">{exactNumber(row.display_amount as string)}</bdi></td>
                        <td>{source?.href ? <a className="p11-record-link" href={source.href}><bdi dir="ltr">{String(source.code ?? 'سفارش')}</bdi></a> : '—'}</td>
                    </tr>;
                })}</tbody>
            </table></div>
        );
    }

    if (page.metric === 'overdue-receivables') {
        return (
            <div className="p11-table-wrap"><table className="p11-table">
                <thead><tr><th scope="col">صورتحساب</th><th scope="col">مشتری</th><th scope="col">سررسید</th><th scope="col">ماندهٔ سررسیدگذشته ({currency === 'IRR' ? 'ریال' : 'تومان'})</th><th scope="col">سفارش فروش</th></tr></thead>
                <tbody>{rows.map((row) => {
                    const source = row.source as { href?: string; code?: string } | undefined;
                    return <tr key={String(row.id)}>
                        <th scope="row"><bdi dir="ltr">{String(row.code)}</bdi></th>
                        <td>{String(row.party_name ?? '—')}</td>
                        <td><bdi dir="ltr">{String(row.due_on)}</bdi></td>
                        <td><bdi dir="ltr">{exactNumber(row.display_outstanding as string)}</bdi></td>
                        <td>{source?.href ? <a className="p11-record-link" href={source.href}><bdi dir="ltr">{String(source.code ?? 'سفارش')}</bdi></a> : '—'}</td>
                    </tr>;
                })}</tbody>
            </table></div>
        );
    }

    if (page.metric === 'available-stock') {
        return (
            <div className="p11-table-wrap"><table className="p11-table">
                <thead><tr><th scope="col">کالا</th><th scope="col">انبار و مکان</th><th scope="col">فیزیکی</th><th scope="col">رزروشده</th><th scope="col">قابل استفاده</th></tr></thead>
                <tbody>{rows.map((row) => {
                    const product = row.product as { code?: string; name?: string } | undefined;
                    const location = row.location as { name?: string; warehouse?: { name?: string } } | undefined;
                    const unit = row.base_unit as { symbol?: string | null } | undefined;
                    return <tr key={`${String(product?.code)}-${String((row.location as { id?: number } | undefined)?.id)}`}>
                        <th scope="row"><span>{String(product?.name ?? '—')}</span> <bdi className="p11-code" dir="ltr">{String(product?.code ?? '')}</bdi></th>
                        <td>{String(location?.warehouse?.name ?? '—')} · {String(location?.name ?? '—')}</td>
                        <td><bdi dir="ltr">{exactNumber(row.physical_quantity as string)} {unit?.symbol ?? ''}</bdi></td>
                        <td><bdi dir="ltr">{exactNumber(row.reserved_quantity as string)} {unit?.symbol ?? ''}</bdi></td>
                        <td><bdi dir="ltr">{exactNumber(row.available_quantity as string)} {unit?.symbol ?? ''}</bdi></td>
                    </tr>;
                })}</tbody>
            </table></div>
        );
    }

    return (
        <div className="p11-table-wrap"><table className="p11-table">
            <thead><tr><th scope="col">درخواست</th><th scope="col">درخواست‌دهنده</th><th scope="col">ارسال‌شده در</th><th scope="col">وضعیت</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={String(row.id)}>
                <th scope="row"><a className="p11-record-link" href={String(row.href)}><bdi dir="ltr">{String(row.code)}</bdi></a><span className="p11-record-title">{String(row.title)}</span></th>
                <td>{String(row.submitter_name ?? '—')}</td>
                <td><bdi dir="ltr">{String(row.submitted_at)}</bdi></td>
                <td><span className="p11-status-pill">در انتظار تأیید</span></td>
            </tr>)}</tbody>
        </table></div>
    );
}

export function DashboardScreen() {
    const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
    const [options, setOptions] = useState<DashboardOptions | null>(null);
    const [bookId, setBookId] = useState<number | null>(null);
    const [asOfDate, setAsOfDate] = useState('');
    const [currency, setCurrency] = useState<DisplayCurrency>('IRR');
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [records, setRecords] = useState<DashboardRecordPage | null>(null);
    const [loadState, setLoadState] = useState<LoadState>('loading');
    const [error, setError] = useState<string | null>(null);
    const [organizationSwitching, setOrganizationSwitching] = useState(false);
    const [retryKey, setRetryKey] = useState(0);
    const metric = useMemo(metricFromUrl, []);
    const [page, setPage] = useState(positivePageFromUrl);
    const forceFallback = new URLSearchParams(window.location.search).get('glass') === 'fallback';

    useEffect(() => {
        const controller = new AbortController();
        setLoadState('loading');
        Promise.all([fetchWorkspaceContext(), fetchDashboardOptions(controller.signal)])
            .then(([context, dashboardOptions]) => {
                const query = new URLSearchParams(window.location.search);
                const requestedBookId = Number(query.get('book_id'));
                const selectedBookId = dashboardOptions.books.some((book) => book.id === requestedBookId)
                    ? requestedBookId
                    : dashboardOptions.default_book_id;
                const selectedBook = dashboardOptions.books.find((book) => book.id === selectedBookId);
                const requestedCurrency = query.get('currency');
                const selectedCurrency = requestedCurrency === 'TOMAN' ? 'TOMAN' : 'IRR';
                const dateFromUrl = query.get('as_of_date');

                setWorkspace(context);
                setOptions(dashboardOptions);
                setBookId(selectedBookId);
                setAsOfDate(dateFromUrl && /^\d{4}-\d{2}-\d{2}$/.test(dateFromUrl)
                    ? dateFromUrl
                    : selectedBookId === dashboardOptions.default_book_id
                        ? dashboardOptions.default_as_of_date ?? ''
                        : selectedBook ? dateInTimeZone(selectedBook.time_zone) : '');
                setCurrency(selectedCurrency);
                setLoadState('ready');
            })
            .catch((cause: unknown) => {
                if (controller.signal.aborted) return;
                setError(cause instanceof Error ? cause.message : 'دریافت اطلاعات فضای کاری انجام نشد.');
                setLoadState(isDenied(cause) ? 'denied' : 'error');
            });

        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (workspace === null || options === null || bookId === null || !asOfDate) return;
        const controller = new AbortController();
        setLoadState('loading');
        setError(null);
        setSummary(null);
        setRecords(null);

        const requests: Array<Promise<DashboardSummary | DashboardRecordPage>> = [
            fetchDashboardSummary({ bookId, asOfDate, currency }, controller.signal),
        ];
        if (metric) requests.push(fetchDashboardRecords(metric, { bookId, asOfDate, currency, page }, controller.signal));

        Promise.all(requests)
            .then((results) => {
                if (controller.signal.aborted) return;
                setSummary(results[0] as DashboardSummary);
                if (metric && results[1]) setRecords(results[1] as DashboardRecordPage);
                setLoadState('ready');
            })
            .catch((cause: unknown) => {
                if (controller.signal.aborted) return;
                setError(cause instanceof Error ? cause.message : 'گزارش دریافت نشد.');
                setLoadState(isDenied(cause) ? 'denied' : 'error');
            });

        return () => controller.abort();
    }, [workspace, options, bookId, asOfDate, currency, metric, page, retryKey]);

    const updateFilterUrl = (next: { bookId: number | null; asOfDate: string; currency: DisplayCurrency }) => {
        const href = queryHref(next, metric ?? undefined, 1);
        window.history.replaceState(null, '', href);
        setPage(1);
    };
    const toolbar = options ? (
        <Toolbar
            options={options}
            bookId={bookId}
            asOfDate={asOfDate}
            currency={currency}
            disabled={loadState === 'loading' || organizationSwitching || options.books.length === 0}
            onBookChange={(value) => { setBookId(value); setSummary(null); setRecords(null); updateFilterUrl({ bookId: value, asOfDate, currency }); }}
            onDateChange={(value) => { setAsOfDate(value); setSummary(null); setRecords(null); updateFilterUrl({ bookId, asOfDate: value, currency }); }}
            onCurrencyChange={(value) => { setCurrency(value); setSummary(null); setRecords(null); updateFilterUrl({ bookId, asOfDate, currency: value }); }}
        />
    ) : <div className="p11-toolbar-placeholder" role="status">در حال آماده‌سازی گزارش…</div>;

    if (loadState === 'denied' && workspace === null) return <AccessDeniedScreen />;
    if (workspace === null || options === null) {
        return <main className="p11-standalone-state" role={loadState === 'error' ? 'alert' : 'status'}>{error ?? 'در حال آماده‌سازی گزارش مدیریتی…'}</main>;
    }

    const activeBook = options.books.find((book) => book.id === bookId);
    const canShowDashboard = options.books.length > 0 && bookId !== null;
    const shell = (children: ReactNode) => (
        <WorkspaceShell
            title="نمای مدیریتی"
            eyebrow="داشبورد داده‌محور · P11"
            subtitle="نمای تاریخی فروش، دریافتنی، موجودی و درخواست‌های تأیید برای سازمان فعال"
            activePage="list"
            connectionState={loadState === 'loading' ? 'loading' : loadState === 'ready' ? 'ready' : 'error'}
            connectionLabel={loadState === 'loading' ? 'در حال دریافت' : loadState === 'ready' ? 'گزارش آماده است' : 'نیازمند بررسی'}
            detailHref={undefined}
            toolbar={toolbar}
            forceFallback={forceFallback}
            activeOrganization={workspace.active_organization}
            organizations={workspace.organizations}
            onOrganizationChange={(organizationId) => {
                setSummary(null);
                setRecords(null);
                setError(null);
                setLoadState('loading');
                setOrganizationSwitching(true);
                void selectOrganization(organizationId)
                    .then(() => window.location.reload())
                    .catch((cause: unknown) => {
                        setError(cause instanceof Error ? cause.message : 'تغییر سازمان انجام نشد.');
                        setLoadState('error');
                        setOrganizationSwitching(false);
                    });
            }}
            onSignOut={() => { void signOut(); }}
            organizationSwitching={organizationSwitching}
            activeResource="dashboard"
            phaseLabel="P11"
        >
            {children}
        </WorkspaceShell>
    );

    if (!canShowDashboard || activeBook === undefined) {
        return shell(<section className="p11-report-surface" data-lg-role="focus"><h1>دفتر مالی موجود نیست</h1><p>برای این سازمان هنوز دفتری برای گزارش‌های مالی تعریف نشده است.</p></section>);
    }

    if (loadState === 'denied') return <AccessDeniedScreen />;

    if (loadState === 'error') {
        return shell(<section className="p11-state-panel" role="alert"><h1>گزارش بارگذاری نشد</h1><p>{error ?? 'اتصال به داده‌های گزارش برقرار نشد.'}</p><button type="button" onClick={() => setRetryKey((value) => value + 1)}>تلاش دوباره</button></section>);
    }

    if (loadState === 'loading' || summary === null) {
        return shell(<section className="p11-state-panel" role="status"><span className="p11-loading-mark" aria-hidden="true" /><h1>در حال محاسبهٔ گزارش</h1><p>مانده‌ها از ردیف‌های ثبت‌شدهٔ سازمان فعال بازسازی می‌شوند.</p></section>);
    }

    const currentFilters = { bookId, asOfDate, currency };
    if (metric) {
        const detail = records;
        return shell(
            <section className="p11-report-surface p11-detail-surface" data-lg-role="focus" data-testid="p11-detail-view">
                <header className="p11-report-heading">
                    <div>
                        <p className="p11-kicker">ردیف‌های منبع · {summary.book.time_zone} · پایان روز {asOfDate}</p>
                        <h1>{metricDetails[metric].title}</h1>
                        <p>{metricDetails[metric].explanation}</p>
                    </div>
                    <a className="p11-back-link" href={queryHref(currentFilters)}>بازگشت به نمای مدیریتی</a>
                </header>
                {detail === null ? <p className="p11-empty" role="status">در حال دریافت ردیف‌ها…</p> : (
                    <>
                        <p className="p11-reconciliation-note" data-testid="p11-detail-count">{countText(detail.pagination.total_records)} ردیف منبع در کل مجموعه؛ صفحهٔ {countText(detail.pagination.current_page)} از {countText(detail.pagination.last_page)}</p>
                        <DetailTable page={detail} currency={currency} />
                        <nav className="p11-pagination" aria-label="صفحه‌بندی ردیف‌های منبع">
                            {detail.pagination.previous_page ? <a href={queryHref(currentFilters, metric, detail.pagination.previous_page)}>صفحهٔ قبل</a> : <span aria-disabled="true">صفحهٔ قبل</span>}
                            {detail.pagination.next_page ? <a href={queryHref(currentFilters, metric, detail.pagination.next_page)}>صفحهٔ بعد</a> : <span aria-disabled="true">صفحهٔ بعد</span>}
                        </nav>
                    </>
                )}
            </section>,
        );
    }

    const metrics = summary.metrics;
    const netHref = queryHref(currentFilters, 'net-sales');
    const receivableHref = queryHref(currentFilters, 'overdue-receivables');
    const stockHref = queryHref(currentFilters, 'available-stock');
    const approvalsHref = queryHref(currentFilters, 'pending-purchase-approvals');
    const dateContext = <><bdi dir="ltr">{asOfDate}</bdi> · دفتر <bdi dir="ltr">{summary.book.code}</bdi></>;

    return shell(
        <>
            <section className="p11-report-surface" data-lg-role="focus" data-testid="p11-dashboard">
                <header className="p11-report-heading">
                    <div>
                        <p className="p11-kicker">گزارش تا پایان روز · <bdi dir="ltr">{summary.cutoff_local}</bdi></p>
                        <h1>وضعیت عملیاتی و مالی</h1>
                        <p>مبنای زمانی: <bdi dir="ltr">{summary.book.time_zone}</bdi> · سازمان فعال: {workspace.active_organization.name}</p>
                    </div>
                    <span className="p11-report-badge">P11 · خواندنی</span>
                </header>

                <div className="p11-metric-grid">
                    <Tile
                        slug="net-sales"
                        title="فروش خالص"
                        value={<bdi dir="ltr" data-testid="p11-net-sales-value">{exactNumber(metrics.net_sales.display_amount)}</bdi>}
                        unit={currency === 'IRR' ? 'ریال' : 'تومان'}
                        note={`فقط صورتحساب مشتری ثبت‌شده تا ${asOfDate} · ${summary.book.code}`}
                        href={netHref}
                        count={metrics.net_sales.record_count}
                        className="p11-tile-financial"
                    />
                    <Tile
                        slug="overdue-receivables"
                        title="دریافتنی سررسیدگذشته"
                        value={<bdi dir="ltr" data-testid="p11-overdue-value">{exactNumber(metrics.overdue_receivables.display_amount)}</bdi>}
                        unit={currency === 'IRR' ? 'ریال' : 'تومان'}
                        note={`ماندهٔ مثبت صورتحساب‌هایی با سررسید پیش از ${asOfDate} · ${summary.book.code}`}
                        href={receivableHref}
                        count={metrics.overdue_receivables.record_count}
                        className="p11-tile-financial"
                    />
                    <Tile
                        slug="available-stock"
                        title="موجودی قابل استفاده"
                        value={metrics.available_stock.unit_totals.length === 0
                            ? <span data-testid="p11-stock-empty">بدون موجودی</span>
                            : <span className="p11-stock-totals" data-testid="p11-stock-value">{metrics.available_stock.unit_totals.map((group) => <span key={group.unit.id}><bdi dir="ltr">{exactNumber(group.quantity)}</bdi> {group.unit.symbol ?? group.unit.name}</span>)}</span>}
                        note={<><span>سازمان فعال · مستقل از دفتر انتخابی · </span>{dateContext}</>}
                        href={stockHref}
                        count={metrics.available_stock.record_count}
                        className="p11-tile-operational"
                    />
                    <Tile
                        slug="pending-purchase-approvals"
                        title="درخواست خرید در انتظار تأیید"
                        value={<bdi dir="ltr" data-testid="p11-approvals-value">{countText(metrics.pending_purchase_approvals.count)}</bdi>}
                        unit="درخواست"
                        note={`سازمان فعال · ارسال‌شده تا پایان ${asOfDate} و تأییدنشده در آن لحظه`}
                        href={approvalsHref}
                        count={metrics.pending_purchase_approvals.record_count}
                        className="p11-tile-operational"
                    />
                </div>

                <footer className="p11-report-footer">
                    <span>مبالغ خام با رشتهٔ دقیق ریال محاسبه می‌شوند؛ نمایش تومان تبدیل دقیق یک‌دهم ریال است.</span>
                    <span>موجودی و تأییدها در سطح سازمان فعال هستند.</span>
                </footer>
            </section>
        </>,
    );
}
