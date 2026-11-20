import type { ReactNode } from 'react';
import { LiquidGlass } from '../liquid-glass/LiquidGlass.jsx';
import type { OrganizationMembership } from '../api/products';

export type WorkspaceConnectionState = 'loading' | 'ready' | 'error';

interface WorkspaceShellProps {
    title: string;
    eyebrow: string;
    subtitle: string;
    activePage: 'list' | 'detail';
    connectionState: WorkspaceConnectionState;
    connectionLabel: string;
    detailHref?: string;
    detailLabel?: string;
    toolbar: ReactNode;
    children: ReactNode;
    forceFallback: boolean;
    activeOrganization: OrganizationMembership;
    organizations: OrganizationMembership[];
    onOrganizationChange: (organizationId: number) => void;
    onSignOut: () => void;
    organizationSwitching: boolean;
}

function BrandMark() {
    return <span className="brand-mark" aria-hidden="true">E</span>;
}

function NavGlyph({ kind }: { kind: 'list' | 'detail' }) {
    return kind === 'list' ? (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
            <path d="M4 5.2h12M4 10h12M4 14.8h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="2.5" cy="5.2" r=".7" fill="currentColor" />
            <circle cx="2.5" cy="10" r=".7" fill="currentColor" />
            <circle cx="2.5" cy="14.8" r=".7" fill="currentColor" />
        </svg>
    ) : (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
            <rect x="3.1" y="3.1" width="13.8" height="13.8" rx="3.1" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6.4 7h7.2M6.4 10h7.2M6.4 13h4.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}

export function WorkspaceShell({
    title,
    eyebrow,
    subtitle,
    activePage,
    connectionState,
    connectionLabel,
    detailHref,
    detailLabel,
    toolbar,
    children,
    forceFallback,
    activeOrganization,
    organizations,
    onOrganizationChange,
    onSignOut,
    organizationSwitching,
}: WorkspaceShellProps) {
    return (
        <main className="app-shell" data-lg-role="stage">
            <div className="app-shell-inner">
                <LiquidGlass
                    as="header"
                    className="workspace-topbar"
                    variant="regular"
                    radius={20}
                    profile="soft"
                    strength={105}
                    magnify={1.04}
                    dispersion={0.008}
                    blur={0.3}
                    adaptive={{ throttleMs: 180, brightTintAlpha: 0.72 }}
                    forceFallback={forceFallback}
                >
                    <a className="brand" href="/" aria-label="رفتن به میزکار ERP">
                        <BrandMark />
                        <span className="brand-copy">
                            <span className="brand-kicker">فضای کاری محلی</span>
                            <strong>ERP</strong>
                        </span>
                    </a>
                    <div className="topbar-context">
                        <span className={`connection-indicator connection-${connectionState}`} aria-hidden="true" />
                        <span>{connectionLabel}</span>
                        <bdi className="topbar-separator" dir="ltr">/</bdi>
                        <span>اطلاعات پایه</span>
                    </div>
                </LiquidGlass>

                <div className="workspace-layout">
                    <aside className="workspace-sidebar" aria-label="ناوبری فضای کاری" data-lg-role="rail">
                        <LiquidGlass
                            className="sidebar-surface"
                            variant="regular"
                            radius={22}
                            profile="soft"
                            strength={105}
                            magnify={1.03}
                            dispersion={0.008}
                            blur={0.3}
                            adaptive={{ throttleMs: 180, brightTintAlpha: 0.72 }}
                            forceFallback={forceFallback}
                        >
                            <div className="sidebar-heading">
                                <span className="sidebar-kicker">فضای کاری</span>
                                <span className="sidebar-caption">پروتوتایپ محلی</span>
                            </div>
                            <nav className="workspace-nav" aria-label="صفحه‌ها">
                                <a
                                    className={`nav-link ${activePage === 'list' ? 'is-current' : ''}`}
                                    href="/products"
                                    aria-current={activePage === 'list' ? 'page' : undefined}
                                >
                                    <NavGlyph kind="list" />
                                    <span>فهرست کالاها</span>
                                    <span className="nav-link-mark" aria-hidden="true" />
                                </a>
                                {detailHref && (
                                    <a
                                        className={`nav-link nav-link-detail ${activePage === 'detail' ? 'is-current' : ''}`}
                                        href={detailHref}
                                        aria-current={activePage === 'detail' ? 'page' : undefined}
                                    >
                                        <NavGlyph kind="detail" />
                                        <span className="nav-link-text">{detailLabel ?? 'جزئیات کالا'}</span>
                                        <span className="nav-link-mark" aria-hidden="true" />
                                    </a>
                                )}
                            </nav>
                            <div className="sidebar-spacer" />
                            <div className="sidebar-status">
                                <span className="sidebar-status-icon" aria-hidden="true">●</span>
                                <div>
                                    <strong>اتصال محلی</strong>
                                    <span>Laravel · MariaDB</span>
                                </div>
                            </div>
                        </LiquidGlass>
                    </aside>

                    <section className="workspace-main" aria-labelledby="page-title">
                        <div className="workspace-account-bar">
                            <label className="organization-picker">
                                <span>سازمان فعال</span>
                                {organizations.length > 1 ? (
                                    <select
                                        value={activeOrganization.id}
                                        onChange={(event) => onOrganizationChange(Number(event.currentTarget.value))}
                                        disabled={organizationSwitching}
                                        aria-label="انتخاب سازمان فعال"
                                    >
                                        {organizations.map((organization) => (
                                            <option key={organization.id} value={organization.id}>{organization.name}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <strong>{activeOrganization.name}</strong>
                                )}
                            </label>
                            <span className={`role-badge role-${activeOrganization.role}`}>
                                {activeOrganization.role === 'editor' ? 'ویرایشگر' : 'فقط‌خواندنی'}
                            </span>
                            <button className="sign-out-button" type="button" onClick={onSignOut}>خروج</button>
                        </div>
                        <header className="page-heading">
                            <div>
                                <p className="eyebrow">{eyebrow}</p>
                                <h1 id="page-title">{title}</h1>
                                <p className="page-subtitle">{subtitle}</p>
                            </div>
                            <span className="page-index"><bdi dir="ltr">P03</bdi></span>
                        </header>

                        <div className="workspace-toolbar" role="toolbar" aria-label="فرمان‌های فهرست کالاها" data-lg-role="dock">
                            {toolbar}
                        </div>

                        {children}
                    </section>
                </div>

                <LiquidGlass
                    as="nav"
                    className="mobile-focus-dock"
                    variant="regular"
                    radius={20}
                    profile="soft"
                    strength={105}
                    magnify={1.04}
                    dispersion={0.006}
                    blur={0.3}
                    forceFallback={forceFallback}
                    aria-label="ناوبری موبایل"
                    data-lg-role="dock"
                >
                    <a className={activePage === 'list' ? 'is-current' : ''} href="/products" aria-current={activePage === 'list' ? 'page' : undefined}>
                        <NavGlyph kind="list" />
                        <span>فهرست</span>
                    </a>
                    {detailHref && (
                        <a className={activePage === 'detail' ? 'is-current' : ''} href={detailHref} aria-current={activePage === 'detail' ? 'page' : undefined}>
                            <NavGlyph kind="detail" />
                            <span>جزئیات</span>
                        </a>
                    )}
                </LiquidGlass>

                <footer className="workspace-footer">
                    <span>محیط توسعهٔ محلی</span>
                    <span><bdi dir="ltr">GET /api/v1/products</bdi></span>
                </footer>
            </div>
        </main>
    );
}
