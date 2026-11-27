import { useEffect, useState } from 'react';
import {
    fetchMembershipRoleHistory,
    fetchOrganizationMembers,
    updateMembershipRole,
    type MembershipRoleAudit,
    type OrganizationMember,
} from '../api/partyExchange';
import { ApiError } from '../api/masterData';
import { fetchWorkspaceContext, selectOrganization, signOut, type WorkspaceContext } from '../api/products';
import { GlassButton } from '../components/GlassButton';
import { WorkspaceShell } from '../components/WorkspaceShell';

type LoadState = 'loading' | 'ready' | 'error' | 'denied';

function roleLabel(role: 'reader' | 'editor' | null): string {
    if (role === 'editor') return 'ویرایشگر';
    if (role === 'reader') return 'فقط‌خواندنی';
    return 'بدون نقش قبلی';
}

function messageFor(error: unknown): string {
    if (error instanceof ApiError) return error.message;
    return 'درخواست انجام نشد. اتصال محلی را بررسی کنید.';
}

function RoleHistory({ events }: { events: MembershipRoleAudit[] }) {
    if (events.length === 0) return <p className="p13-history-empty" role="status">برای این عضویت هنوز تغییری در نقش ثبت نشده است.</p>;

    return (
        <ol className="p13-history-list">
            {events.map((event) => (
                <li key={event.id}>
                    <div className="p13-history-change">
                        <span>{roleLabel(event.prior_role)}</span>
                        <span aria-hidden="true">←</span>
                        <strong>{roleLabel(event.new_role)}</strong>
                    </div>
                    <p>{event.actor ? `${event.actor.name} · ${event.actor.email}` : 'منبع سیستمی'} · <bdi dir="ltr">{event.created_at ?? 'زمان نامشخص'}</bdi></p>
                </li>
            ))}
        </ol>
    );
}

export function MembershipAdministrationScreen() {
    const [context, setContext] = useState<WorkspaceContext | null>(null);
    const [members, setMembers] = useState<OrganizationMember[]>([]);
    const [selectedRoles, setSelectedRoles] = useState<Record<number, 'reader' | 'editor'>>({});
    const [selectedHistory, setSelectedHistory] = useState<number | null>(null);
    const [history, setHistory] = useState<MembershipRoleAudit[]>([]);
    const [state, setState] = useState<LoadState>('loading');
    const [attempt, setAttempt] = useState(0);
    const [switching, setSwitching] = useState(false);
    const [savingId, setSavingId] = useState<number | null>(null);
    const [message, setMessage] = useState('');
    const forceFallback = new URLSearchParams(window.location.search).get('glass') === 'fallback';

    useEffect(() => {
        const controller = new AbortController();
        let mounted = true;
        setState('loading');
        setMessage('');

        Promise.all([
            fetchWorkspaceContext(controller.signal),
            fetchOrganizationMembers(controller.signal),
        ]).then(([workspace, rows]) => {
            if (!mounted) return;
            setContext(workspace);
            setMembers(rows);
            setSelectedRoles(Object.fromEntries(rows.map((member) => [member.id, member.role])));
            setState('ready');
        }).catch((error: unknown) => {
            if (!mounted || (error instanceof DOMException && error.name === 'AbortError')) return;
            setState(error instanceof ApiError && error.status === 403 ? 'denied' : 'error');
        });

        return () => { mounted = false; controller.abort(); };
    }, [attempt]);

    async function changeOrganization(organizationId: number): Promise<void> {
        setSwitching(true);
        setMessage('');
        try {
            await selectOrganization(organizationId);
            setAttempt((current) => current + 1);
            setSelectedHistory(null);
            setHistory([]);
        } catch (error) {
            setMessage(messageFor(error));
        } finally {
            setSwitching(false);
        }
    }

    async function showHistory(member: OrganizationMember): Promise<void> {
        if (selectedHistory === member.id) {
            setSelectedHistory(null);
            setHistory([]);
            return;
        }

        setSelectedHistory(member.id);
        setHistory([]);
        setMessage('');
        try {
            const response = await fetchMembershipRoleHistory(member.id);
            setHistory(response.data);
        } catch (error) {
            setMessage(messageFor(error));
        }
    }

    async function saveRole(member: OrganizationMember): Promise<void> {
        const nextRole = selectedRoles[member.id] ?? member.role;
        if (nextRole === member.role || savingId !== null) return;

        setSavingId(member.id);
        setMessage('');
        try {
            const response = await updateMembershipRole(member.id, { role: nextRole, expected_role: member.role });
            setMembers((current) => current.map((item) => item.id === member.id ? { ...item, role: response.data.role } : item));
            const workspace = await fetchWorkspaceContext();
            setContext(workspace);
            if (selectedHistory === member.id) {
                const audit = await fetchMembershipRoleHistory(member.id);
                setHistory(audit.data);
            }
            setMessage(response.changed
                ? 'نقش تغییر کرد؛ دسترسی جدید در درخواست‌های بعدی اعمال می‌شود.'
                : 'نقش تغییری نکرد؛ رویداد ممیزی تازه‌ای افزوده نشد.');
        } catch (error) {
            setMessage(messageFor(error));
        } finally {
            setSavingId(null);
        }
    }

    async function exitSession(): Promise<void> {
        try { await signOut(); } catch { setMessage('خروج انجام نشد؛ دوباره تلاش کنید.'); }
    }

    const roleManagerCount = members.filter((member) => member.role_manager).length;
    const toolbar = (
        <div className="toolbar-actions">
            <span className="toolbar-context-label">اعضای سازمان فعال · P13</span>
            <GlassButton variant="tinted" onClick={() => setAttempt((current) => current + 1)} disabled={state === 'loading'} forceFallback={forceFallback}>به‌روزرسانی</GlassButton>
        </div>
    );

    if (context === null) {
        return <main className="app-shell" data-lg-role="stage"><section className="focus-content" data-lg-role="focus" aria-busy={state === 'loading'}>
            <div className="state-panel" role={state === 'error' || state === 'denied' ? 'alert' : 'status'}>
                <h2>{state === 'loading' ? 'در حال بررسی دسترسی سازمان' : state === 'denied' ? 'دسترسی مدیریت نقش‌ها فعال نیست' : 'اتصال به فهرست اعضا برقرار نشد'}</h2>
                <p>{state === 'loading' ? 'عضویت مدیر نقش و فهرست سازمان فعال بررسی می‌شود.' : state === 'denied' ? 'این فهرست و تاریخچه فقط برای مدیر نقشی است که در محیط محلی به‌صورت صریح provision شده باشد.' : 'اتصال محلی را بررسی و دوباره تلاش کنید.'}</p>
                {state !== 'loading' && <GlassButton variant="tinted" onClick={() => setAttempt((current) => current + 1)}>تلاش دوباره</GlassButton>}
            </div>
        </section></main>;
    }

    return (
        <WorkspaceShell
            title="اعضای سازمان"
            eyebrow="مدیریت دسترسی · P13"
            subtitle="تغییر نقش‌های موجود و بررسی رویدادهای ممیزی سازمان فعال"
            activePage="list"
            activeResource="membership-roles"
            phaseLabel="P13"
            connectionState={state === 'ready' ? 'ready' : state === 'loading' ? 'loading' : 'error'}
            connectionLabel={state === 'ready' ? 'اعضا دریافت شدند' : state === 'loading' ? 'در حال دریافت داده' : 'نیاز به بررسی'}
            toolbar={toolbar}
            forceFallback={forceFallback}
            activeOrganization={context.active_organization}
            organizations={context.organizations}
            onOrganizationChange={changeOrganization}
            onSignOut={exitSession}
            organizationSwitching={switching}
        >
            {state === 'loading' ? (
                <section className="focus-content" data-lg-role="focus" aria-busy="true"><div className="state-panel" role="status"><h2>در حال دریافت اعضا</h2></div></section>
            ) : state === 'error' ? (
                <section className="focus-content" data-lg-role="focus"><div className="state-panel error-panel" role="alert"><h2>فهرست اعضا دریافت نشد</h2><GlassButton variant="tinted" onClick={() => setAttempt((current) => current + 1)}>تلاش دوباره</GlassButton></div></section>
            ) : state === 'denied' || !context.capabilities.membership_roles.manage ? (
                <section className="focus-content" data-lg-role="focus"><div className="state-panel denied-card" role="alert"><h2>اجازهٔ مشاهدهٔ تاریخچه ندارید</h2><p>مدیریت نقش و خواندن ممیزی به عضویت مدیر نقش نیاز دارد؛ نقش ویرایشگر عادی این اختیار را نمی‌دهد.</p></div></section>
            ) : (
                <section className="focus-content p13-membership-surface" aria-labelledby="p13-members-title" data-lg-role="focus" data-testid="p13-memberships">
                    <div className="surface-heading">
                        <div><p className="eyebrow">عضویت‌های ذخیره‌شده</p><h2 id="p13-members-title">اعضای سازمان فعال</h2></div>
                        <span className="result-count"><bdi dir="ltr">{members.length}</bdi><span>عضو</span></span>
                    </div>
                    <div className="p13-policy-note">
                        <strong>مدیر نقش سازمان: <bdi dir="ltr">{roleManagerCount}</bdi></strong>
                        <span>این اختیار جدا از نقش عملیاتی ویرایشگر است. تغییر نقش خودتان مجاز است؛ مجوز مدیر نقش مستقل می‌ماند و حذف آخرین مدیر فقط با فرمان محلی و در صورت باقی‌ماندن مدیر دیگری انجام می‌شود.</span>
                    </div>
                    {members.length === 0 ? <p className="p13-history-empty" role="status">عضوی در سازمان فعال ثبت نشده است.</p> : (
                        <div className="p13-table-wrap">
                            <table className="p13-table">
                                <caption className="visually-hidden">عضویت‌ها و ویرایش نقش سازمانی</caption>
                                <thead><tr><th scope="col">عضو</th><th scope="col">نقش فعلی</th><th scope="col">نقش جدید</th><th scope="col">سابقه</th><th scope="col">عملیات</th></tr></thead>
                                <tbody>{members.map((member) => (
                                    <tr key={member.id} data-testid={`p13-member-${member.id}`}>
                                        <th scope="row"><span>{member.name}</span><small>{member.email}</small>{member.role_manager && <small className="p13-manager-badge">مدیر نقش</small>}</th>
                                        <td><span className={`p13-role-badge p13-role-${member.role}`}>{roleLabel(member.role)}</span></td>
                                        <td>
                                            <label className="visually-hidden" htmlFor={`p13-role-${member.id}`}>نقش تازه برای {member.name}</label>
                                            <select id={`p13-role-${member.id}`} value={selectedRoles[member.id] ?? member.role} onChange={(event) => {
                                                const nextRole = event.currentTarget.value as 'reader' | 'editor';
                                                setSelectedRoles((current) => ({ ...current, [member.id]: nextRole }));
                                            }} disabled={savingId !== null}>
                                                <option value="reader">فقط‌خواندنی</option>
                                                <option value="editor">ویرایشگر</option>
                                            </select>
                                        </td>
                                        <td><button type="button" className="p13-text-button" aria-expanded={selectedHistory === member.id} onClick={() => void showHistory(member)}>{selectedHistory === member.id ? 'بستن سابقه' : 'نمایش سابقه'}</button></td>
                                        <td><GlassButton variant="tinted" data-testid={`p13-save-role-${member.id}`} onClick={() => void saveRole(member)} disabled={savingId !== null || (selectedRoles[member.id] ?? member.role) === member.role} forceFallback={forceFallback}>
                                            {savingId === member.id ? 'در حال ذخیره…' : 'ذخیرهٔ نقش'}
                                        </GlassButton></td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    )}
                    {selectedHistory !== null && (
                        <section className="p13-history-panel" aria-labelledby="p13-history-title" data-testid="p13-role-history">
                            <div className="surface-heading"><div><p className="eyebrow">ممیزی عضویت #{selectedHistory}</p><h3 id="p13-history-title">تغییرهای نقش</h3></div></div>
                            <RoleHistory events={history} />
                        </section>
                    )}
                    <p className="p13-status-message" role="status" aria-live="polite">{message}</p>
                </section>
            )}
        </WorkspaceShell>
    );
}
