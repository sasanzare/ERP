import { useState, type ChangeEvent } from 'react';
import { ApiError } from '../api/masterData';
import {
    applyPartyImport,
    previewPartyImport,
    type PartyImportPreview,
    type PartyImportResult,
    type PartyImportRow,
} from '../api/partyExchange';
import { GlassButton } from './GlassButton';

const identityStorageKey = 'erp.p13.party-import-identity';

interface SavedIdentity {
    name: string;
    size: number;
    lastModified: number;
    importKey: string;
}

function newImportKey(): string {
    return crypto.randomUUID();
}

function identityFor(file: File): string {
    try {
        const saved = JSON.parse(localStorage.getItem(identityStorageKey) ?? 'null') as SavedIdentity | null;
        if (saved?.name === file.name && saved.size === file.size && saved.lastModified === file.lastModified) {
            return saved.importKey;
        }
    } catch {
        // A new in-memory identity is enough when browser storage is unavailable.
    }

    return newImportKey();
}

function persistIdentity(file: File, importKey: string): void {
    try {
        const saved: SavedIdentity = { name: file.name, size: file.size, lastModified: file.lastModified, importKey };
        localStorage.setItem(identityStorageKey, JSON.stringify(saved));
    } catch {
        // The current view still retains the same import key for retries.
    }
}

function roleLabel(roles: string[]): string {
    return roles.map((role) => role === 'customer' ? 'مشتری' : 'تأمین‌کننده').join(' · ') || '—';
}

function classificationLabel(row: PartyImportRow): string {
    if (row.outcome === 'created') return 'ثبت شد';
    if (row.outcome === 'pending') return 'در انتظار ثبت';
    if (row.classification === 'duplicate') return 'تکراری';
    if (row.classification === 'invalid') return 'نامعتبر';
    return 'معتبر';
}

export function PartyImportPanel({
    open,
    onClose,
    onApplied,
    forceFallback,
}: {
    open: boolean;
    onClose: () => void;
    onApplied: () => void | Promise<void>;
    forceFallback: boolean;
}) {
    const [file, setFile] = useState<File | null>(null);
    const [importKey, setImportKey] = useState('');
    const [payloadHash, setPayloadHash] = useState('');
    const [preview, setPreview] = useState<PartyImportPreview | null>(null);
    const [result, setResult] = useState<PartyImportResult | null>(null);
    const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
    const [message, setMessage] = useState('');

    function selectFile(event: ChangeEvent<HTMLInputElement>): void {
        const selectedFile = event.currentTarget.files?.[0] ?? null;
        setFile(selectedFile);
        setPreview(null);
        setResult(null);
        setPayloadHash('');
        setMessage('');

        if (selectedFile) {
            const key = identityFor(selectedFile);
            setImportKey(key);
            persistIdentity(selectedFile, key);
        } else {
            setImportKey('');
        }
    }

    async function createPreview(): Promise<void> {
        if (!file) return;
        setBusy('preview');
        setMessage('');
        setResult(null);

        try {
            const response = await previewPartyImport(file);
            setPreview(response);
            setPayloadHash(response.payload_hash);
        } catch (error) {
            setMessage(error instanceof ApiError ? error.message : 'پیش‌نمایش فایل انجام نشد. قالب و اتصال محلی را بررسی کنید.');
        } finally {
            setBusy(null);
        }
    }

    async function applyPreview(): Promise<void> {
        if (!file || !importKey || !payloadHash || !preview) return;
        setBusy('apply');
        setMessage('');

        try {
            const response = await applyPartyImport(file, importKey, payloadHash);
            setResult(response);
            setPreview({ payload_hash: response.payload_hash, counts: response.counts, rows: response.rows });
            await onApplied();
            setMessage(response.status === 'completed' ? 'نتیجهٔ ورود ذخیره شد؛ تکرار همین شناسه رکورد تازه‌ای ایجاد نمی‌کند.' : 'ثبت بخشی انجام شد؛ با همین فایل و شناسه ادامه دهید.');
        } catch (error) {
            setMessage(error instanceof ApiError ? error.message : 'ثبت فایل کامل نشد. برای ادامه، همین فایل و شناسه را دوباره اعمال کنید.');
        } finally {
            setBusy(null);
        }
    }

    function startNewImport(): void {
        if (!file) return;
        const key = newImportKey();
        setImportKey(key);
        persistIdentity(file, key);
        setPreview(null);
        setResult(null);
        setPayloadHash('');
        setMessage('شناسهٔ تازه ساخته شد. پیش از اعمال، فایل را دوباره پیش‌نمایش کنید.');
    }

    const rows = result?.rows ?? preview?.rows ?? [];
    const counts = result?.counts ?? preview?.counts;
    const canApply = preview !== null && (preview.counts.valid > 0 || (result?.counts.pending ?? 0) > 0);

    return (
        <section className="p13-import-panel" aria-labelledby="p13-import-title" data-lg-role="rail" hidden={!open}>
            <div className="p13-panel-heading">
                <div>
                    <p className="eyebrow">ورود دادهٔ طرف‌های تجاری</p>
                    <h2 id="p13-import-title">پیش‌نمایش و ثبت CSV / XLSX</h2>
                    <p>فایل ابتدا بررسی می‌شود؛ تا زمانی که «اعمال» را بزنید، داده‌ای ذخیره نمی‌شود.</p>
                </div>
                <button className="p13-text-button" data-testid="p13-import-close" type="button" onClick={onClose}>بستن</button>
            </div>

            <div className="p13-import-controls">
                <label className="p13-file-field" htmlFor="p13-import-file">
                    <span>فایل ورودی</span>
                    <input id="p13-import-file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={selectFile} />
                    <small>{file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : 'حداکثر ۵ مگابایت و ۱۰۰۰ ردیف'}</small>
                </label>
                <a className="p13-template-link" href="/api/v1/parties/import/template">دانلود قالب CSV</a>
                <div className="p13-action-group">
                    <GlassButton type="button" variant="regular" data-testid="p13-import-preview" onClick={createPreview} disabled={!file || busy !== null} forceFallback={forceFallback}>
                        {busy === 'preview' ? 'در حال بررسی…' : 'پیش‌نمایش'}
                    </GlassButton>
                    <GlassButton type="button" variant="tinted" data-testid="p13-import-apply" onClick={applyPreview} disabled={!canApply || busy !== null} forceFallback={forceFallback}>
                        {busy === 'apply' ? 'در حال اعمال…' : result?.status === 'applying' ? 'ادامهٔ اعمال' : 'اعمال ردیف‌های معتبر'}
                    </GlassButton>
                </div>
            </div>

            <p className="p13-import-note">قالب: <bdi dir="ltr">party_id, party_code, display_name, roles</bdi> · نقش‌ها با <bdi dir="ltr">|</bdi> جدا می‌شوند. کدهای XLSX را از ابتدا به‌صورت Text ذخیره کنید.</p>

            {counts && (
                <div className="p13-import-counts" aria-live="polite">
                    <span><bdi dir="ltr">{counts.valid}</bdi> معتبر</span>
                    <span><bdi dir="ltr">{counts.duplicate}</bdi> تکراری</span>
                    <span><bdi dir="ltr">{counts.invalid}</bdi> نامعتبر</span>
                    {result && <span><bdi dir="ltr">{counts.created}</bdi> ثبت‌شده</span>}
                </div>
            )}

            {rows.length > 0 && (
                <div className="p13-import-table-wrap">
                    <table className="p13-table p13-import-table">
                        <caption className="visually-hidden">نتیجهٔ ردیف‌های فایل واردشده</caption>
                        <thead><tr><th scope="col">سطر</th><th scope="col">کد</th><th scope="col">نام نمایشی</th><th scope="col">نقش‌ها</th><th scope="col">نتیجه</th></tr></thead>
                        <tbody>{rows.map((row) => (
                            <tr key={row.source_row} data-testid={`p13-import-row-${row.source_row}`} className={`p13-row-${row.outcome ?? row.classification}`}>
                                <td><bdi dir="ltr">{row.source_row}</bdi></td>
                                <td><bdi dir="ltr">{row.party_code || '—'}</bdi></td>
                                <td>{row.display_name || '—'}</td>
                                <td>{roleLabel(row.roles)}</td>
                                <td><span className={`p13-outcome p13-outcome-${row.outcome ?? row.classification}`}>{classificationLabel(row)}</span><small>{row.message}</small></td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            )}

            <p className="p13-status-message" role="status" aria-live="polite">{message}</p>
            {file && preview && <button className="p13-text-button p13-new-import" type="button" onClick={startNewImport}>ورود تازه با همین فایل</button>}
        </section>
    );
}
