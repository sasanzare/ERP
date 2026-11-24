import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
    AccountingApiError,
    closeAccountingPeriod,
    createAccountingAccount,
    createAccountingBook,
    createAccountingDraft,
    createAccountingPeriod,
    fetchAccountingJournal,
    fetchAccountingJournals,
    fetchAccountingOptions,
    postAccountingDraft,
    reverseAccountingJournal,
    updateAccountingDraft,
    type AccountCategory,
    type AccountingAccount,
    type AccountingBook,
    type AccountingJournal,
    type AccountingJournalInput,
    type AccountingOptions,
    type AccountingPeriod,
} from '../api/accounting';
import { fetchWorkspaceContext, selectOrganization, signOut, type WorkspaceContext } from '../api/products';
import { GlassButton } from '../components/GlassButton';
import { GlassSearchField } from '../components/GlassSearchField';
import { WorkspaceShell } from '../components/WorkspaceShell';

type LoadState = 'loading' | 'ready' | 'error' | 'denied';
type DraftLine = { accountId: string; memo: string; debit: string; credit: string };
type RetryKey = { signature: string; value: string } | null;

const categoryLabels: Record<AccountCategory, string> = {
    asset: 'دارایی',
    liability: 'بدهی',
    equity: 'حقوق مالکانه',
    revenue: 'درآمد',
    expense: 'هزینه',
};

function currentRoute(): { isNew: boolean; id: number | null; bookId: number | null } {
    const segment = window.location.pathname.replace(/\/+$/, '').split('/').at(-1) ?? '';
    const bookId = new URLSearchParams(window.location.search).get('book_id');
    return {
        isNew: segment === 'new',
        id: /^\d+$/.test(segment) ? Number(segment) : null,
        bookId: bookId && /^\d+$/.test(bookId) ? Number(bookId) : null,
    };
}

function href(path: string, bookId?: number | null): string {
    const current = new URLSearchParams(window.location.search);
    const params = new URLSearchParams();
    for (const key of ['glass', 'scene']) {
        const value = current.get(key);
        if (value) params.set(key, value);
    }
    if (bookId) params.set('book_id', String(bookId));
    const query = params.toString();
    return query ? `${path}?${query}` : path;
}

function formatRial(value: string): string {
    try {
        return new Intl.NumberFormat('fa-IR').format(BigInt(value));
    } catch {
        return value;
    }
}

function formatDate(value: string | null): string {
    if (!value) return '—';
    const date = new Date(`${value.slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.getTime())
        ? value
        : new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeZone: 'Asia/Tehran' }).format(date);
}

function localDate(timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function nextRetryKey(previous: RetryKey, payload: unknown): NonNullable<RetryKey> {
    const signature = JSON.stringify(payload);
    return previous?.signature === signature ? previous : { signature, value: crypto.randomUUID() };
}

function Panel({ title, note, children, className = '' }: { title: string; note?: string; children: ReactNode; className?: string }) {
    return (
        <section className={`accounting-panel ${className}`.trim()}>
            <header className="accounting-panel-heading">
                <div><h2>{title}</h2>{note && <p className="accounting-muted">{note}</p>}</div>
            </header>
            {children}
        </section>
    );
}

function Feedback({ message, tone = 'error' }: { message: string; tone?: 'error' | 'success' }) {
    if (!message) return null;
    return <p className={`accounting-feedback accounting-feedback-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{message}</p>;
}

function Status({ value }: { value: 'draft' | 'posted' | 'open' | 'closed' }) {
    const labels: Record<typeof value, string> = {
        draft: 'پیش‌نویس', posted: 'ثبت‌شده', open: 'دورهٔ باز', closed: 'بسته',
    };
    return <span className={`accounting-status accounting-status-${value}`}>{labels[value]}</span>;
}

function BookForm({ busy, fallback, onCreate }: { busy: boolean; fallback: boolean; onCreate: (input: { code: string; name: string; time_zone: string }) => Promise<void> }) {
    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [message, setMessage] = useState('');

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setMessage('');
        try {
            await onCreate({ code: code.trim(), name: name.trim(), time_zone: 'Asia/Tehran' });
            setCode('');
            setName('');
        } catch (cause) {
            setMessage(cause instanceof Error ? cause.message : 'ساخت دفتر انجام نشد.');
        }
    }

    return (
        <Panel title="دفتر حسابداری" note="مبالغ این دفتر به ریال کامل ذخیره می‌شوند.">
            <p className="accounting-note" data-testid="accounting-scope-note">این محیط فقط برای ثبت‌های دستی با دادهٔ synthetic است. رویدادهای فروش، خرید و انبار خودکار به حسابداری منتقل نمی‌شوند؛ نگاشت حساب، مالیات و بهای تمام‌شده هنوز نیازمند تصمیم است.</p>
            <form className="accounting-form" onSubmit={(event) => void submit(event)} data-testid="accounting-book-form">
                <div className="accounting-grid">
                    <label className="accounting-field" htmlFor="accounting-book-code"><span>کد دفتر</span><input id="accounting-book-code" data-testid="accounting-book-code" value={code} onChange={(event) => setCode(event.currentTarget.value)} maxLength={64} required /></label>
                    <label className="accounting-field" htmlFor="accounting-book-name"><span>نام دفتر</span><input id="accounting-book-name" data-testid="accounting-book-name" value={name} onChange={(event) => setName(event.currentTarget.value)} maxLength={160} required /></label>
                </div>
                <label className="accounting-field accounting-field-short" htmlFor="accounting-book-time-zone"><span>منطقهٔ زمانی دفتر</span><input id="accounting-book-time-zone" value="Asia/Tehran" readOnly dir="ltr" /></label>
                <div className="accounting-action-row"><GlassButton type="submit" variant="tinted" disabled={busy} forceFallback={fallback}>{busy ? 'در حال ذخیره…' : 'ساخت دفتر'}</GlassButton></div>
                <Feedback message={message} />
            </form>
        </Panel>
    );
}

function AccountForm({
    book, accounts, busy, fallback, onCreate,
}: { book: AccountingBook; accounts: AccountingAccount[]; busy: boolean; fallback: boolean; onCreate: (input: { parent_account_id: number | null; code: string; name: string; category: AccountCategory; is_postable: boolean }) => Promise<void> }) {
    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [category, setCategory] = useState<AccountCategory>('asset');
    const [parentId, setParentId] = useState('');
    const [postable, setPostable] = useState(true);
    const [message, setMessage] = useState('');

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setMessage('');
        try {
            await onCreate({ parent_account_id: parentId ? Number(parentId) : null, code: code.trim(), name: name.trim(), category, is_postable: postable });
            setCode('');
            setName('');
        } catch (cause) {
            setMessage(cause instanceof Error ? cause.message : 'ساخت حساب انجام نشد.');
        }
    }

    return (
        <Panel title="افزودن حساب" note={`دفتر ${book.name} · حساب‌های سرگروه، ثبت‌پذیر نیستند.`}>
            <form className="accounting-form" onSubmit={(event) => void submit(event)} data-testid="accounting-account-form">
                <div className="accounting-grid">
                    <label className="accounting-field" htmlFor="accounting-account-code"><span>کد حساب</span><input id="accounting-account-code" data-testid="accounting-account-code" value={code} onChange={(event) => setCode(event.currentTarget.value)} maxLength={64} required /></label>
                    <label className="accounting-field" htmlFor="accounting-account-name"><span>نام نمایشی حساب</span><input id="accounting-account-name" data-testid="accounting-account-name" value={name} onChange={(event) => setName(event.currentTarget.value)} maxLength={160} required /></label>
                    <label className="accounting-field" htmlFor="accounting-account-category"><span>گروه حساب</span><select id="accounting-account-category" value={category} onChange={(event) => setCategory(event.currentTarget.value as AccountCategory)}>{Object.entries(categoryLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                    <label className="accounting-field" htmlFor="accounting-account-parent"><span>حساب بالادستی</span><select id="accounting-account-parent" value={parentId} onChange={(event) => setParentId(event.currentTarget.value)}><option value="">بدون سرگروه</option>{accounts.filter((account) => !account.is_postable).map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
                </div>
                <label className="accounting-check" htmlFor="accounting-account-postable"><input id="accounting-account-postable" type="checkbox" checked={postable} onChange={(event) => setPostable(event.currentTarget.checked)} /><span>این حساب ثبت‌پذیر است</span></label>
                <div className="accounting-action-row"><GlassButton type="submit" variant="tinted" disabled={busy} forceFallback={fallback}>{busy ? 'در حال ذخیره…' : 'افزودن حساب'}</GlassButton></div>
                <Feedback message={message} />
            </form>
            {accounts.length > 0 && <div className="accounting-mini-list" aria-label="حساب‌های همین دفتر">{accounts.map((account) => <div className="accounting-mini-row" key={account.id}><bdi dir="ltr">{account.code}</bdi><span>{account.name}</span><span>{account.is_postable ? 'ثبت‌پذیر' : 'سرگروه'}</span></div>)}</div>}
        </Panel>
    );
}

function PeriodForm({ book, busy, fallback, onCreate }: { book: AccountingBook; busy: boolean; fallback: boolean; onCreate: (input: { code: string; name: string; starts_on: string; ends_on: string }) => Promise<void> }) {
    const today = localDate(book.time_zone);
    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [startsOn, setStartsOn] = useState(`${today.slice(0, 4)}-01-01`);
    const [endsOn, setEndsOn] = useState(`${today.slice(0, 4)}-12-31`);
    const [message, setMessage] = useState('');

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setMessage('');
        try {
            await onCreate({ code: code.trim(), name: name.trim(), starts_on: startsOn, ends_on: endsOn });
            setCode('');
            setName('');
        } catch (cause) {
            setMessage(cause instanceof Error ? cause.message : 'ساخت دوره انجام نشد.');
        }
    }

    return (
        <Panel title="دورهٔ مالی" note="بازهٔ تقویم میلادی شامل روز آغاز و پایان است؛ دوره‌ها هم‌پوشانی ندارند.">
            <form className="accounting-form" onSubmit={(event) => void submit(event)} data-testid="accounting-period-form">
                <div className="accounting-grid">
                    <label className="accounting-field" htmlFor="accounting-period-code"><span>کد دوره</span><input id="accounting-period-code" data-testid="accounting-period-code" value={code} onChange={(event) => setCode(event.currentTarget.value)} maxLength={40} required /></label>
                    <label className="accounting-field" htmlFor="accounting-period-name"><span>نام دوره</span><input id="accounting-period-name" data-testid="accounting-period-name" value={name} onChange={(event) => setName(event.currentTarget.value)} maxLength={160} required /></label>
                    <label className="accounting-field" htmlFor="accounting-period-start"><span>از تاریخ</span><input id="accounting-period-start" data-testid="accounting-period-start" type="date" value={startsOn} onChange={(event) => setStartsOn(event.currentTarget.value)} required /></label>
                    <label className="accounting-field" htmlFor="accounting-period-end"><span>تا تاریخ</span><input id="accounting-period-end" data-testid="accounting-period-end" type="date" value={endsOn} onChange={(event) => setEndsOn(event.currentTarget.value)} required /></label>
                </div>
                <div className="accounting-action-row"><GlassButton type="submit" variant="tinted" disabled={busy} forceFallback={fallback}>{busy ? 'در حال ذخیره…' : 'ساخت دورهٔ باز'}</GlassButton></div>
                <Feedback message={message} />
            </form>
        </Panel>
    );
}

function PeriodList({ periods, canManage, busyId, fallback, onClose }: {
    periods: AccountingPeriod[]; canManage: boolean; busyId: number | null; fallback: boolean; onClose: (id: number) => Promise<void>;
}) {
    if (periods.length === 0) return <p className="accounting-empty">برای ثبت سند، یک دورهٔ مالی بسازید.</p>;
    return <div className="accounting-period-list">{periods.map((period) => (
        <article className="accounting-period-row" key={period.id} data-testid={`accounting-period-${period.id}`}>
            <div><strong>{period.name} · <bdi dir="ltr">{period.code}</bdi></strong><span><bdi dir="ltr">{period.starts_on}</bdi> تا <bdi dir="ltr">{period.ends_on}</bdi></span></div>
            <div className="accounting-period-actions"><Status value={period.status} />{canManage && period.status === 'open' && <GlassButton disabled={busyId === period.id} forceFallback={fallback} onClick={() => void onClose(period.id)}>{busyId === period.id ? 'در حال بستن…' : 'بستن دوره'}</GlassButton>}</div>
        </article>
    ))}</div>;
}

function JournalList({ journals, filter, onFilterChange, bookId }: { journals: AccountingJournal[]; filter: string; onFilterChange: (value: string) => void; bookId: number | null }) {
    const needle = filter.trim().toLocaleLowerCase();
    const rows = useMemo(() => journals.filter((journal) => `${journal.code} ${journal.description} ${journal.status}`.toLocaleLowerCase().includes(needle)), [journals, needle]);

    return (
        <Panel title="دفتر روزنامه" note="سندهای ثبت‌شده تغییر نمی‌کنند؛ هر اصلاح با سند برگشتی جدا ثبت می‌شود." className="accounting-register-panel">
            <GlassSearchField label="جست‌وجو در اسناد روزنامه" value={filter} onChange={onFilterChange} placeholder="کد یا شرح سند" />
            <div className="accounting-register" aria-live="polite">
                {rows.length ? rows.map((journal) => (
                    <article className="accounting-journal-row" key={journal.id} data-testid={`accounting-journal-${journal.id}`}>
                        <div className="accounting-journal-main">
                            <p className="accounting-eyebrow"><bdi dir="ltr">{journal.code}</bdi> · {formatDate(journal.accounting_date)}</p>
                            <h3><a className="accounting-link" href={href(`/accounting/journals/${journal.id}`, bookId)}>{journal.description}</a></h3>
                            <div className="accounting-meta"><span>دفتر: {journal.book.name}</span><span>دوره: {journal.period?.name ?? 'تعیین نشده'}</span><span>{journal.lines.length} سطر</span></div>
                            {journal.reversal_of && <p className="accounting-link-row">برگشت سند <a className="accounting-link" href={href(`/accounting/journals/${journal.reversal_of.id}`, bookId)}><bdi dir="ltr">{journal.reversal_of.code}</bdi></a></p>}
                            {journal.reversal && <p className="accounting-link-row">برگشت ثبت‌شده: <a className="accounting-link" href={href(`/accounting/journals/${journal.reversal.id}`, bookId)}><bdi dir="ltr">{journal.reversal.code}</bdi></a></p>}
                        </div>
                        <div className="accounting-journal-totals"><Status value={journal.status} /><span>بدهکار <strong>{formatRial(journal.debit_total_rial)} ریال</strong></span><span>بستانکار <strong>{formatRial(journal.credit_total_rial)} ریال</strong></span></div>
                    </article>
                )) : <div className="accounting-empty" role="status"><h3>{needle ? 'سندی پیدا نشد' : 'هنوز سندی ثبت نشده است'}</h3><p>برای شروع، یک پیش‌نویس بسازید و پس از کنترل تراز آن را ثبت کنید.</p></div>}
            </div>
        </Panel>
    );
}

function SetupRail({
    book, options, canManage, fallback, busy, busyPeriodId, onCreateAccount, onCreatePeriod, onClosePeriod,
}: {
    book: AccountingBook;
    options: AccountingOptions;
    canManage: boolean;
    fallback: boolean;
    busy: string;
    busyPeriodId: number | null;
    onCreateAccount: (input: { parent_account_id: number | null; code: string; name: string; category: AccountCategory; is_postable: boolean }) => Promise<void>;
    onCreatePeriod: (input: { code: string; name: string; starts_on: string; ends_on: string }) => Promise<void>;
    onClosePeriod: (id: number) => Promise<void>;
}) {
    return (
        <aside className="accounting-setup-rail" data-lg-role="rail" aria-label="تنظیم دفتر و دوره">
            {canManage && <>
                <details className="accounting-disclosure"><summary>مدیریت سرفصل‌های دفتر</summary><AccountForm book={book} accounts={options.accounts} busy={busy === 'account'} fallback={fallback} onCreate={onCreateAccount} /></details>
                <details className="accounting-disclosure"><summary>مدیریت دوره‌های مالی</summary>
                    <PeriodForm book={book} busy={busy === 'period'} fallback={fallback} onCreate={onCreatePeriod} />
                    <PeriodList periods={options.periods} canManage={canManage} busyId={busyPeriodId} fallback={fallback} onClose={onClosePeriod} />
                </details>
            </>}
            {!canManage && <Panel title="دسترسی حسابداری"><p className="accounting-muted">نقش فقط‌خواندنی اجازهٔ مرور دفاتر و سندها را دارد.</p></Panel>}
            {canManage && <Panel title="واحد و محدوده"><p>واحد این دفتر ریال کامل است.</p><p>تاریخ‌های حسابداری، تاریخ میلادی در منطقهٔ {book.time_zone} هستند.</p></Panel>}
        </aside>
    );
}

function blankLine(accountId = ''): DraftLine {
    return { accountId, memo: '', debit: '0', credit: '0' };
}

function JournalEditor({
    journal, book, accounts, periods, busy, fallback, canManage, notice, error, onSave, onPost,
}: {
    journal: AccountingJournal | null;
    book: AccountingBook;
    accounts: AccountingAccount[];
    periods: AccountingPeriod[];
    busy: string;
    fallback: boolean;
    canManage: boolean;
    notice: string;
    error: string;
    onSave: (input: AccountingJournalInput) => Promise<void>;
    onPost: (input: AccountingJournalInput) => Promise<void>;
}) {
    const [date, setDate] = useState(journal?.accounting_date ?? localDate(book.time_zone));
    const [description, setDescription] = useState(journal?.description ?? '');
    const [lines, setLines] = useState<DraftLine[]>(journal?.lines.map((line) => ({
        accountId: String(line.account.id), memo: line.memo ?? '', debit: line.debit_rial, credit: line.credit_rial,
    })) ?? [blankLine(), blankLine()]);
    const [localError, setLocalError] = useState('');
    const postableAccounts = accounts.filter((account) => account.is_active && account.is_postable);
    const selectedPeriod = periods.find((period) => period.status === 'open' && date >= period.starts_on && date <= period.ends_on);
    const debitTotal = sumDraft(lines, 'debit');
    const creditTotal = sumDraft(lines, 'credit');
    const isDraft = canManage && (journal === null || journal.status === 'draft');

    useEffect(() => {
        if (journal === null) return;
        setDate(journal.accounting_date);
        setDescription(journal.description);
        setLines(journal.lines.map((line) => ({ accountId: String(line.account.id), memo: line.memo ?? '', debit: line.debit_rial, credit: line.credit_rial })));
    }, [journal]);

    function input(): AccountingJournalInput | null {
        if (!date || !description.trim() || lines.some((line) => !line.accountId || !/^\d+$/.test(line.debit) || !/^\d+$/.test(line.credit))) {
            setLocalError('تاریخ، شرح، حساب و مبلغ صحیح هر سطر را کامل کنید.');
            return null;
        }
        setLocalError('');
        return {
            accounting_date: date,
            description: description.trim(),
            lines: lines.map((line) => ({ account_id: Number(line.accountId), memo: line.memo.trim(), debit_rial: line.debit, credit_rial: line.credit })),
        };
    }

    function submitSave(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const value = input();
        if (value) void onSave(value).catch((cause) => setLocalError(cause instanceof Error ? cause.message : 'ذخیرهٔ پیش‌نویس انجام نشد.'));
    }

    function post() {
        const value = input();
        if (value) void onPost(value).catch((cause) => setLocalError(cause instanceof Error ? cause.message : 'ثبت سند انجام نشد.'));
    }

    return (
        <section className="focus-content accounting-focus" data-lg-role="focus" data-testid="accounting-journal-editor">
            <Panel title={journal ? `سند ${journal.code}` : 'پیش‌نویس سند روزنامه'} note={`دفتر ${book.name} · مبالغ برحسب ریال کامل`}>
                <p className="accounting-note" data-testid="accounting-scope-note">این محیط فقط برای ثبت‌های دستی با دادهٔ synthetic است. رویدادهای فروش، خرید و انبار خودکار به حسابداری منتقل نمی‌شوند؛ نگاشت حساب، مالیات و بهای تمام‌شده هنوز نیازمند تصمیم است.</p>
                <form className="accounting-form" onSubmit={submitSave} data-testid="accounting-journal-form">
                    <div className="accounting-grid">
                        <label className="accounting-field" htmlFor="accounting-journal-date"><span>تاریخ حسابداری</span><input id="accounting-journal-date" data-testid="accounting-journal-date" type="date" dir="ltr" value={date} onChange={(event) => setDate(event.currentTarget.value)} disabled={!isDraft} required /></label>
                        <label className="accounting-field accounting-field-wide" htmlFor="accounting-journal-description"><span>شرح سند</span><input id="accounting-journal-description" data-testid="accounting-journal-description" value={description} onChange={(event) => setDescription(event.currentTarget.value)} maxLength={500} disabled={!isDraft} required /></label>
                    </div>
                    <div className="accounting-line-list">
                        {lines.map((line, index) => <article className="accounting-line-card" key={index} data-testid={`accounting-line-${index}`}>
                            <div className="accounting-line-heading"><strong>سطر {formatRial(String(index + 1))}</strong>{isDraft && lines.length > 2 && <GlassButton type="button" forceFallback={fallback} onClick={() => setLines((current) => current.filter((_, row) => row !== index))} aria-label={`حذف سطر ${index + 1}`}>حذف</GlassButton>}</div>
                            <div className="accounting-line-grid">
                                <label className="accounting-field" htmlFor={`accounting-line-account-${index}`}><span>حساب ثبت‌پذیر</span><select id={`accounting-line-account-${index}`} data-testid={`accounting-line-account-${index}`} value={line.accountId} onChange={(event) => { const accountId = event.currentTarget.value; setLines((current) => current.map((item, row) => row === index ? { ...item, accountId } : item)); }} disabled={!isDraft} required><option value="">انتخاب حساب</option>{postableAccounts.map((account) => <option value={account.id} key={account.id}>{account.code} · {account.name}</option>)}</select></label>
                                <label className="accounting-field" htmlFor={`accounting-line-memo-${index}`}><span>شرح سطر</span><input id={`accounting-line-memo-${index}`} value={line.memo} onChange={(event) => { const memo = event.currentTarget.value; setLines((current) => current.map((item, row) => row === index ? { ...item, memo } : item)); }} maxLength={255} disabled={!isDraft} /></label>
                                <label className="accounting-field" htmlFor={`accounting-line-debit-${index}`}><span>بدهکار · ریال</span><input id={`accounting-line-debit-${index}`} data-testid={`accounting-line-debit-${index}`} dir="ltr" inputMode="numeric" value={line.debit} onChange={(event) => { const debit = event.currentTarget.value; setLines((current) => current.map((item, row) => row === index ? { ...item, debit } : item)); }} disabled={!isDraft} required /></label>
                                <label className="accounting-field" htmlFor={`accounting-line-credit-${index}`}><span>بستانکار · ریال</span><input id={`accounting-line-credit-${index}`} data-testid={`accounting-line-credit-${index}`} dir="ltr" inputMode="numeric" value={line.credit} onChange={(event) => { const credit = event.currentTarget.value; setLines((current) => current.map((item, row) => row === index ? { ...item, credit } : item)); }} disabled={!isDraft} required /></label>
                            </div>
                        </article>)}
                    </div>
                    {isDraft && <div className="accounting-action-row accounting-action-row-between"><GlassButton type="button" forceFallback={fallback} onClick={() => setLines((current) => [...current, blankLine(postableAccounts[0] ? String(postableAccounts[0].id) : '')])}>افزودن سطر</GlassButton><span className="accounting-period-hint">{selectedPeriod ? `دورهٔ ثبت: ${selectedPeriod.name}` : 'برای این تاریخ یک دورهٔ باز لازم است.'}</span></div>}
                    <div className="accounting-total-strip"><span>جمع بدهکار: <strong>{formatRial(debitTotal)} ریال</strong></span><span>جمع بستانکار: <strong>{formatRial(creditTotal)} ریال</strong></span><b className={debitTotal === creditTotal && debitTotal !== '0' ? 'is-balanced' : 'is-unbalanced'}>{debitTotal === creditTotal && debitTotal !== '0' ? 'تراز است' : 'نیازمند تراز'}</b></div>
                    {!postableAccounts.length && isDraft && <p className="accounting-note">ابتدا در همین دفتر دست‌کم دو حساب ثبت‌پذیر بسازید.</p>}
                    {canManage && isDraft && <div className="accounting-action-row">
                        <GlassButton type="submit" forceFallback={fallback} disabled={busy === 'save'}>{busy === 'save' ? 'در حال ذخیره…' : 'ذخیرهٔ پیش‌نویس'}</GlassButton>
                        <GlassButton type="button" variant="tinted" forceFallback={fallback} disabled={busy === 'post' || !postableAccounts.length} onClick={post}>{busy === 'post' ? 'در حال ثبت…' : 'ثبت نهایی'}</GlassButton>
                    </div>}
                    {localError && <Feedback message={localError} />}
                    <Feedback message={error} />
                    <Feedback message={notice} tone="success" />
                </form>
                {journal?.status === 'posted' && <div className="accounting-posting-meta"><span>ثبت‌کننده: {journal.posted_by ?? '—'}</span><span>زمان ثبت: {journal.posted_at ? new Date(journal.posted_at).toLocaleString('fa-IR', { timeZone: book.time_zone }) : '—'}</span><span>هویت ثبت: <bdi dir="ltr">{journal.posting_identity ?? '—'}</bdi></span></div>}
            </Panel>
        </section>
    );
}

function sumDraft(lines: DraftLine[], side: 'debit' | 'credit'): string {
    try {
        return lines.reduce((total, line) => {
            if (!/^\d+$/.test(line[side])) return total;
            return total + BigInt(line[side]);
        }, 0n).toString();
    } catch {
        return '0';
    }
}

function JournalDetail({ journal, canManage, fallback, onReverse }: { journal: AccountingJournal; canManage: boolean; fallback: boolean; onReverse: (input: { accounting_date: string; reason: string }) => Promise<void> }) {
    const openPeriods = journal.period?.status === 'open';
    const [date, setDate] = useState(journal.period?.status === 'open' ? journal.accounting_date : '');
    const [reason, setReason] = useState('اصلاح سند');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const eligible = journal.status === 'posted' && journal.reversal_of === null && journal.reversal === null;

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!date || !reason.trim()) {
            setError('تاریخ برگشت و دلیل آن را وارد کنید.');
            return;
        }
        setError('');
        setBusy(true);
        try {
            await onReverse({ accounting_date: date, reason: reason.trim() });
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'برگشت سند انجام نشد.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="focus-content accounting-focus" data-lg-role="focus" data-testid={`accounting-journal-detail-${journal.id}`}>
            <Panel title={`سند ${journal.code}`} note={journal.description}>
                <div className="accounting-detail-heading"><Status value={journal.status} /><span>تاریخ حسابداری: <bdi dir="ltr">{journal.accounting_date}</bdi></span><span>دفتر: {journal.book.name}</span><span>دوره: {journal.period?.name ?? '—'}</span></div>
                {journal.reversal_of && <p className="accounting-note">این سند برگشت <a className="accounting-link" href={href(`/accounting/journals/${journal.reversal_of.id}`, journal.book.id)}>{journal.reversal_of.code}</a> است.</p>}
                {journal.reversal && <p className="accounting-note">برگشت این سند: <a className="accounting-link" href={href(`/accounting/journals/${journal.reversal.id}`, journal.book.id)}>{journal.reversal.code}</a> · <bdi dir="ltr">{journal.reversal.accounting_date}</bdi></p>}
                <div className="accounting-posted-lines" role="table" aria-label="سطرهای سند ثبت‌شده">
                    <div className="accounting-posted-line accounting-posted-header" role="row"><span>حساب</span><span>شرح</span><span>بدهکار · ریال</span><span>بستانکار · ریال</span></div>
                    {journal.lines.map((line) => <div className="accounting-posted-line" role="row" key={line.id}>
                        <span><bdi dir="ltr">{line.account.code}</bdi> · {line.account.name}</span><span>{line.memo || '—'}</span><strong>{formatRial(line.debit_rial)}</strong><strong>{formatRial(line.credit_rial)}</strong>
                    </div>)}
                    <div className="accounting-posted-line accounting-posted-total" role="row"><strong>جمع کل</strong><span /><strong>{formatRial(journal.debit_total_rial)}</strong><strong>{formatRial(journal.credit_total_rial)}</strong></div>
                </div>
                {eligible && canManage && <form className="accounting-reversal-form" onSubmit={(event) => void submit(event)} data-testid="accounting-reversal-form">
                    <h3>ثبت سند برگشتی</h3>
                    <p className="accounting-muted">سند اصلی تغییر نمی‌کند. برگشت باید در یک دورهٔ باز باشد؛ دورهٔ بسته دوباره باز نمی‌شود.</p>
                    <div className="accounting-grid">
                        <label className="accounting-field" htmlFor="accounting-reversal-date"><span>تاریخ ثبت برگشت</span><input id="accounting-reversal-date" data-testid="accounting-reversal-date" type="date" value={date} onChange={(event) => setDate(event.currentTarget.value)} required /></label>
                        <label className="accounting-field accounting-field-wide" htmlFor="accounting-reversal-reason"><span>دلیل برگشت</span><input id="accounting-reversal-reason" data-testid="accounting-reversal-reason" value={reason} onChange={(event) => setReason(event.currentTarget.value)} maxLength={255} required /></label>
                    </div>
                    {!openPeriods && <p className="accounting-note">تاریخ اولیه در دورهٔ بسته یا بدون دوره است؛ تاریخ برگشت را به یک دورهٔ باز تغییر دهید.</p>}
                    <div className="accounting-action-row"><GlassButton type="submit" variant="tinted" forceFallback={fallback} disabled={busy}>{busy ? 'در حال ثبت برگشت…' : 'ثبت برگشت متوازن'}</GlassButton></div>
                    <Feedback message={error} />
                </form>}
                {journal.status === 'posted' && <div className="accounting-posting-meta"><span>ثبت‌کننده: {journal.posted_by ?? '—'}</span><span>زمان ثبت: {journal.posted_at ? new Date(journal.posted_at).toLocaleString('fa-IR', { timeZone: journal.book.time_zone }) : '—'}</span><span>هویت ثبت: <bdi dir="ltr">{journal.posting_identity ?? '—'}</bdi></span></div>}
            </Panel>
        </section>
    );
}

export function AccountingScreen() {
    const route = currentRoute();
    const fallback = new URLSearchParams(window.location.search).get('glass') === 'fallback';
    const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
    const [options, setOptions] = useState<AccountingOptions | null>(null);
    const [canManage, setCanManage] = useState(false);
    const [bookId, setBookId] = useState<number | null>(route.bookId);
    const [journals, setJournals] = useState<AccountingJournal[]>([]);
    const [journal, setJournal] = useState<AccountingJournal | null>(null);
    const [loadState, setLoadState] = useState<LoadState>('loading');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState('');
    const [busyPeriodId, setBusyPeriodId] = useState<number | null>(null);
    const [filter, setFilter] = useState('');
    const [reloadCount, setReloadCount] = useState(0);
    const [postKey, setPostKey] = useState<RetryKey>(null);
    const [reversalKey, setReversalKey] = useState<RetryKey>(null);
    const accountBook = options?.books.find((item) => item.id === bookId) ?? options?.books[0] ?? null;
    const isNew = route.isNew;

    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            setLoadState('loading');
            setError('');
            try {
                const context = await fetchWorkspaceContext(controller.signal);
                setWorkspace(context);
                let journalDetail: AccountingJournal | null = null;
                if (route.id !== null) {
                    journalDetail = await fetchAccountingJournal(route.id, controller.signal);
                    setJournal(journalDetail);
                } else {
                    setJournal(null);
                }
                const desiredBookId = journalDetail?.book.id ?? bookId ?? undefined;
                const response = await fetchAccountingOptions(desiredBookId, controller.signal);
                const selectedId = response.data.selected_book_id;
                setOptions(response.data);
                setCanManage(response.can_manage && context.active_organization.role === 'editor');
                if (selectedId !== null && selectedId !== bookId) setBookId(selectedId);
                if (journalDetail === null) {
                    setJournals(selectedId === null ? [] : await fetchAccountingJournals(selectedId, controller.signal));
                }
                setLoadState('ready');
            } catch (cause) {
                if (controller.signal.aborted) return;
                const failure = cause instanceof Error ? cause : new Error('دریافت اطلاعات حسابداری انجام نشد.');
                setError(failure.message);
                setLoadState(cause instanceof AccountingApiError && cause.status === 403 ? 'denied' : 'error');
            }
        }
        void load();
        return () => controller.abort();
    }, [bookId, reloadCount, route.id]);

    async function refresh() {
        setReloadCount((value) => value + 1);
    }

    async function runAction(name: string, action: () => Promise<void>) {
        setBusy(name);
        setError('');
        setNotice('');
        try {
            await action();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'عملیات حسابداری انجام نشد.');
            throw cause;
        } finally {
            setBusy('');
        }
    }

    async function createBook(input: { code: string; name: string; time_zone: string }) {
        await runAction('book', async () => {
            const book = await createAccountingBook(input);
            setNotice(`دفتر ${book.name} ساخته شد.`);
            setBookId(book.id);
            setReloadCount((value) => value + 1);
        });
    }

    async function createAccount(input: { parent_account_id: number | null; code: string; name: string; category: AccountCategory; is_postable: boolean }) {
        if (!bookId) return;
        await runAction('account', async () => {
            const account = await createAccountingAccount(bookId, input);
            setNotice(`حساب ${account.code} افزوده شد.`);
            setReloadCount((value) => value + 1);
        });
    }

    async function createPeriod(input: { code: string; name: string; starts_on: string; ends_on: string }) {
        if (!bookId) return;
        await runAction('period', async () => {
            const period = await createAccountingPeriod(bookId, input);
            setNotice(`دورهٔ ${period.name} ساخته شد.`);
            setReloadCount((value) => value + 1);
        });
    }

    async function closePeriod(id: number) {
        setBusyPeriodId(id);
        setError('');
        setNotice('');
        try {
            const period = await closeAccountingPeriod(id);
            setOptions((current) => current ? {
                ...current,
                periods: current.periods.map((item) => item.id === period.id ? period : item),
            } : current);
            setNotice(`دورهٔ ${period.name} بسته شد.`);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'بستن دوره انجام نشد.');
        } finally {
            setBusyPeriodId(null);
        }
    }

    function saveDraft(input: AccountingJournalInput): Promise<void> {
        if (!bookId) return Promise.reject(new Error('ابتدا دفتر حسابداری بسازید.'));
        return runAction('save', async () => {
            const saved = journal === null ? await createAccountingDraft(bookId, input) : await updateAccountingDraft(journal.id, input);
            setJournal(saved);
            setNotice('پیش‌نویس ذخیره شد؛ تا زمان ثبت نهایی قابل ویرایش است.');
            if (journal === null) window.location.assign(href(`/accounting/journals/${saved.id}`, saved.book.id));
        });
    }

    function postDraft(input: AccountingJournalInput): Promise<void> {
        if (!bookId) return Promise.reject(new Error('ابتدا دفتر حسابداری بسازید.'));
        return runAction('post', async () => {
            const saved = journal === null ? await createAccountingDraft(bookId, input) : await updateAccountingDraft(journal.id, input);
            setJournal(saved);
            const key = nextRetryKey(postKey, { journal_id: saved.id, ...input });
            setPostKey(key);
            const result = await postAccountingDraft(saved.id, key.value);
            setJournal(result.journal);
            setNotice(result.already_exists ? 'همان ثبت قبلی بازیابی شد.' : 'سند متوازن به‌صورت اتمی ثبت شد.');
            setReloadCount((value) => value + 1);
            if (journal === null) window.location.assign(href(`/accounting/journals/${result.journal.id}`, result.journal.book.id));
        });
    }

    async function reverseJournal(input: { accounting_date: string; reason: string }) {
        if (!journal) return;
        const key = nextRetryKey(reversalKey, { journal_id: journal.id, ...input });
        setReversalKey(key);
        const result = await reverseAccountingJournal(journal.id, input, key.value);
        setNotice(result.already_exists ? 'همان سند برگشتی بازیابی شد.' : 'سند برگشتی متوازن ثبت و به سند اصلی پیوند داده شد.');
        window.location.assign(href(`/accounting/journals/${result.journal.id}`, result.journal.book.id));
    }

    const routePath = route.id !== null ? `/accounting/journals/${route.id}` : isNew ? '/accounting/journals/new' : '/accounting/journals';
    const detailHref = route.id !== null || isNew ? href(routePath, bookId) : undefined;
    const toolbar = <div className="accounting-toolbar"><GlassButton onClick={() => void refresh()} forceFallback={fallback}>به‌روزرسانی</GlassButton>{canManage && !isNew && route.id === null && accountBook && <GlassButton variant="tinted" onClick={() => window.location.assign(href('/accounting/journals/new', accountBook.id))} forceFallback={fallback}>پیش‌نویس تازه</GlassButton>}</div>;

    if (!workspace) {
        return <main className="app-shell"><div className="app-shell-inner"><section className="state-panel" role={loadState === 'error' ? 'alert' : 'status'}><h1>{loadState === 'loading' ? 'در حال بارگیری حسابداری…' : 'فضای حسابداری باز نشد'}</h1>{error && <p>{error}</p>}</section></div></main>;
    }

    const content = loadState === 'loading'
        ? <section className="focus-content accounting-focus" data-lg-role="focus"><div className="accounting-panel" role="status">در حال دریافت دفترها و سندها…</div></section>
        : loadState === 'error' || loadState === 'denied'
            ? <section className="focus-content accounting-focus" data-lg-role="focus"><div className="accounting-panel" role="alert"><h2>{loadState === 'denied' ? 'دسترسی حسابداری مجاز نیست' : 'اطلاعات حسابداری بارگیری نشد'}</h2><p>{error}</p><GlassButton variant="tinted" onClick={() => void refresh()} forceFallback={fallback}>تلاش دوباره</GlassButton></div></section>
            : !options?.books.length
                ? <section className="focus-content accounting-focus" data-lg-role="focus"><Feedback message={error} />{notice && <Feedback message={notice} tone="success" />}{canManage ? <BookForm busy={busy === 'book'} fallback={fallback} onCreate={createBook} /> : <Panel title="دفتر حسابداری"><p className="accounting-empty">هنوز دفتری برای این سازمان ساخته نشده است.</p></Panel>}</section>
                : isNew || route.id !== null
                    ? journal && journal.status === 'posted'
                        ? <JournalDetail journal={journal} canManage={canManage} fallback={fallback} onReverse={reverseJournal} />
                        : accountBook
                            ? <JournalEditor journal={journal} book={accountBook} accounts={options.accounts} periods={options.periods} busy={busy} fallback={fallback} canManage={canManage} notice={notice} error={error} onSave={saveDraft} onPost={postDraft} />
                            : <section className="focus-content accounting-focus" data-lg-role="focus"><Panel title="دفتر انتخاب نشده"><p className="accounting-empty">یک دفتر حسابداری انتخاب کنید.</p></Panel></section>
                    : <div className="accounting-page-grid">
                        <section className="focus-content accounting-focus" data-lg-role="focus">
                            <Panel title="دفتر فعال" note="دفتر حسابداری و دوره، مبنای انتخاب حساب‌ها و تاریخ ثبت هستند.">
                                <p className="accounting-note" data-testid="accounting-scope-note">ثبت‌ها دستی و با دادهٔ synthetic هستند. فروش، خرید و گردش انبار خودکار ثبت نمی‌شوند؛ نگاشت حساب، مالیات و بهای تمام‌شده نیازمند تصمیم دامنه‌ای است.</p>
                                <div className="accounting-book-bar">
                                    <label className="accounting-field" htmlFor="accounting-book-selector"><span>دفتر حسابداری</span><select id="accounting-book-selector" data-testid="accounting-book-selector" value={accountBook?.id ?? ''} onChange={(event) => setBookId(Number(event.currentTarget.value))}>{options.books.map((book) => <option value={book.id} key={book.id}>{book.code} · {book.name}</option>)}</select></label>
                                    <span className="accounting-currency-badge">{accountBook?.currency.code} · ریال کامل</span>
                                </div>
                                {!options.periods.length && <p className="accounting-note">برای ثبت نهایی، یک دورهٔ مالی تعریف کنید. پیش‌نویس را می‌توان پیش از آماده‌شدن دوره نگه داشت.</p>}
                            </Panel>
                            <Feedback message={error} />{notice && <Feedback message={notice} tone="success" />}
                            <JournalList journals={journals} filter={filter} onFilterChange={setFilter} bookId={accountBook?.id ?? null} />
                        </section>
                        {accountBook && <SetupRail book={accountBook} options={options} canManage={canManage} fallback={fallback} busy={busy} busyPeriodId={busyPeriodId} onCreateAccount={createAccount} onCreatePeriod={createPeriod} onClosePeriod={closePeriod} />}
                    </div>;

    return (
        <WorkspaceShell
            title="دفتر روزنامه"
            eyebrow="حسابداری · P09"
            subtitle="دفترهای ریالی، تراز ثبت‌ها، دوره‌های مالی و سندهای برگشتی"
            activePage={route.id !== null || isNew ? 'detail' : 'list'}
            connectionState={loadState === 'ready' ? 'ready' : loadState === 'loading' ? 'loading' : 'error'}
            connectionLabel={loadState === 'ready' ? 'دفتر محلی آماده است' : loadState === 'loading' ? 'در حال دریافت' : 'نیازمند بررسی'}
            detailHref={detailHref}
            detailLabel={journal?.code ?? (isNew ? 'پیش‌نویس تازه' : undefined)}
            toolbar={toolbar}
            forceFallback={fallback}
            activeOrganization={workspace.active_organization}
            organizations={workspace.organizations}
            onOrganizationChange={(organizationId) => { void selectOrganization(organizationId).then(() => window.location.reload()).catch((cause) => setError(cause instanceof Error ? cause.message : 'تغییر سازمان انجام نشد.')); }}
            onSignOut={() => { void signOut(); }}
            organizationSwitching={false}
            activeResource="accounting"
            phaseLabel="P09"
        >
            {content}
        </WorkspaceShell>
    );
}
