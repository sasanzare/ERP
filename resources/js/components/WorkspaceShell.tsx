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
    activeResource?: string;
    phaseLabel?: string;
}

const resourceLinks = [
    { id: 'products', href: '/products', label: 'کالاها' },
    { id: 'parties', href: '/parties', label: 'طرف‌های تجاری' },
    { id: 'units', href: '/units', label: 'واحدها' },
    { id: 'warehouses', href: '/warehouses', label: 'انبارها' },
    { id: 'locations', href: '/locations', label: 'مکان‌ها' },
    { id: 'price-lists', href: '/price-lists', label: 'فهرست قیمت' },
];

const salesLinks = [
    { id: 'leads', href: '/leads', label: 'سرنخ‌ها' },
    { id: 'follow-ups', href: '/follow-ups', label: 'پیگیری‌های عقب‌افتاده' },
    { id: 'quotes', href: '/quotes', label: 'پیش‌فاکتورها' },
    { id: 'orders', href: '/orders', label: 'سفارش‌های فروش' },
];

const stockLinks = [
    { id: 'stock', href: '/stock', label: 'ماندهٔ موجودی' },
    { id: 'stock-movements', href: '/stock/movements', label: 'گردش موجودی' },
    { id: 'stock-reservations', href: '/stock/reservations', label: 'رزروها' },
];

const purchasingLinks = [
    { id: 'purchase-requests', href: '/purchase-requests', label: 'درخواست‌های خرید' },
    { id: 'purchase-orders', href: '/purchase-orders', label: 'سفارش‌های خرید' },
];

const accountingLinks = [
    { id: 'accounting', href: '/accounting/journals', label: 'دفتر روزنامه' },
];
const settlementLinks = [
    { id: 'settlements', href: '/settlements', label: 'صورتحساب و تسویه' },
];
const dashboardLinks = [
    { id: 'dashboard', href: '/dashboard', label: 'نمای مدیریتی' },
];

const isDashboardResource = (resource: string) => dashboardLinks.some((item) => item.id === resource);
const isMasterDataResource = (resource: string) => resourceLinks.some((item) => item.id === resource && item.id !== 'products');
const isSalesResource = (resource: string) => salesLinks.some((item) => item.id === resource);
const isStockResource = (resource: string) => stockLinks.some((item) => item.id === resource);
const isPurchasingResource = (resource: string) => purchasingLinks.some((item) => item.id === resource);
const isAccountingResource = (resource: string) => accountingLinks.some((item) => item.id === resource);
const isSettlementResource = (resource: string) => settlementLinks.some((item) => item.id === resource);
const activeListHref = (resource: string) => salesLinks.find((item) => item.id === resource)?.href ?? '/parties';
const activeListLabel = (resource: string) => salesLinks.find((item) => item.id === resource)?.label ?? 'اطلاعات پایه';
const activeStockHref = (resource: string) => stockLinks.find((item) => item.id === resource)?.href ?? '/stock';
const activeStockLabel = (resource: string) => stockLinks.find((item) => item.id === resource)?.label ?? 'ماندهٔ موجودی';
const activePurchasingHref = (resource: string) => purchasingLinks.find((item) => item.id === resource)?.href ?? '/purchase-requests';
const activePurchasingLabel = (resource: string) => purchasingLinks.find((item) => item.id === resource)?.label ?? 'درخواست‌های خرید';
const activeAccountingHref = (resource: string) => accountingLinks.find((item) => item.id === resource)?.href ?? '/accounting/journals';
const activeAccountingLabel = (resource: string) => accountingLinks.find((item) => item.id === resource)?.label ?? 'دفتر روزنامه';
const activeSettlementHref = (resource: string) => settlementLinks.find((item) => item.id === resource)?.href ?? '/settlements';
const activeSettlementLabel = (resource: string) => settlementLinks.find((item) => item.id === resource)?.label ?? 'صورتحساب و تسویه';

function shellHref(path: string): string {
    const currentParams = new URLSearchParams(window.location.search);
    const preserved = new URLSearchParams();
    for (const key of ['glass', 'scene']) {
        const value = currentParams.get(key);
        if (value) preserved.set(key, value);
    }
    const query = preserved.toString();
    return query ? `${path}?${query}` : path;
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
    activeResource = 'products',
    phaseLabel = 'P03',
}: WorkspaceShellProps) {
    return (
        <main className="app-shell" data-lg-role="stage" data-resource={activeResource}>
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
                        <span>{isDashboardResource(activeResource) ? 'گزارش مدیریتی' : isSettlementResource(activeResource) ? 'تسویه‌ها' : isAccountingResource(activeResource) ? 'حسابداری' : isPurchasingResource(activeResource) ? 'خرید' : isStockResource(activeResource) ? 'انبار' : isSalesResource(activeResource) ? 'فروش' : 'اطلاعات پایه'}</span>
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
                                <div className="nav-group-label">گزارش · P11</div>
                                {dashboardLinks.map((item) => (
                                    <a
                                        key={item.id}
                                        className={`nav-link nav-link-resource ${activeResource === item.id ? 'is-current' : ''}`}
                                        href={shellHref(item.href)}
                                        aria-current={activeResource === item.id ? 'page' : undefined}
                                    >
                                        <NavGlyph kind="list" />
                                        <span className="nav-link-text">{item.label}</span>
                                        <span className="nav-link-mark" aria-hidden="true" />
                                    </a>
                                ))}
                                <a
                                    className={`nav-link ${activeResource === 'products' && activePage === 'list' ? 'is-current' : ''}`}
                                    href={shellHref('/products')}
                                    aria-current={activeResource === 'products' && activePage === 'list' ? 'page' : undefined}
                                >
                                    <NavGlyph kind="list" />
                                    <span>فهرست کالاها</span>
                                    <span className="nav-link-mark" aria-hidden="true" />
                                </a>
                                {detailHref && (
                                    <a
                                        className={`nav-link nav-link-detail ${activeResource === 'products' && activePage === 'detail' ? 'is-current' : ''}`}
                                        href={detailHref}
                                        aria-current={activeResource === 'products' && activePage === 'detail' ? 'page' : undefined}
                                    >
                                        <NavGlyph kind="detail" />
                                        <span className="nav-link-text">{detailLabel ?? 'جزئیات کالا'}</span>
                                        <span className="nav-link-mark" aria-hidden="true" />
                                    </a>
                                )}
                                <div className="nav-group-label">اطلاعات پایه · P04</div>
                                {resourceLinks.map((item) => (
                                    <a
                                        key={item.id}
                                        className={`nav-link nav-link-resource ${activeResource === item.id ? 'is-current' : ''}`}
                                        href={shellHref(item.href)}
                                        aria-current={activeResource === item.id ? 'page' : undefined}
                                    >
                                        <NavGlyph kind="list" />
                                        <span className="nav-link-text">{item.label}</span>
                                        <span className="nav-link-mark" aria-hidden="true" />
                                    </a>
                                ))}
                                <div className="nav-group-label">فروش · P05</div>
                                {salesLinks.map((item) => (
                                    <a
                                        key={item.id}
                                        className={`nav-link nav-link-resource ${activeResource === item.id ? 'is-current' : ''}`}
                                        href={shellHref(item.href)}
                                        aria-current={activeResource === item.id ? 'page' : undefined}
                                    >
                                        <NavGlyph kind="list" />
                                        <span className="nav-link-text">{item.label}</span>
                                        <span className="nav-link-mark" aria-hidden="true" />
                                    </a>
                                ))}
                                <div className="nav-group-label">انبار · P06</div>
                                {stockLinks.map((item) => (
                                    <a
                                        key={item.id}
                                        className={`nav-link nav-link-resource ${activeResource === item.id ? 'is-current' : ''}`}
                                        href={shellHref(item.href)}
                                        aria-current={activeResource === item.id ? 'page' : undefined}
                                    >
                                        <NavGlyph kind="list" />
                                        <span className="nav-link-text">{item.label}</span>
                                        <span className="nav-link-mark" aria-hidden="true" />
                                    </a>
                                ))}
                                <div className="nav-group-label">خرید · P08</div>
                                {purchasingLinks.map((item) => (
                                    <a
                                        key={item.id}
                                        className={`nav-link nav-link-resource ${activeResource === item.id ? 'is-current' : ''}`}
                                        href={shellHref(item.href)}
                                        aria-current={activeResource === item.id ? 'page' : undefined}
                                    >
                                        <NavGlyph kind="list" />
                                        <span className="nav-link-text">{item.label}</span>
                                        <span className="nav-link-mark" aria-hidden="true" />
                                    </a>
                                ))}
                                <div className="nav-group-label">حسابداری · P09</div>
                                {accountingLinks.map((item) => (
                                    <a key={item.id} className={`nav-link nav-link-resource ${activeResource === item.id ? 'is-current' : ''}`} href={shellHref(item.href)} aria-current={activeResource === item.id ? 'page' : undefined}>
                                        <NavGlyph kind="list" />
                                        <span className="nav-link-text">{item.label}</span>
                                        <span className="nav-link-mark" aria-hidden="true" />
                                    </a>
                                ))}
                                <div className="nav-group-label">صورتحساب · P10</div>
                                {settlementLinks.map((item) => (
                                    <a key={item.id} className={`nav-link nav-link-resource ${activeResource === item.id ? 'is-current' : ''}`} href={shellHref(item.href)} aria-current={activeResource === item.id ? 'page' : undefined}>
                                        <NavGlyph kind="list" />
                                        <span className="nav-link-text">{item.label}</span>
                                        <span className="nav-link-mark" aria-hidden="true" />
                                    </a>
                                ))}
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
                                <h1 id="page-title" tabIndex={-1}>{title}</h1>
                                <p className="page-subtitle">{subtitle}</p>
                            </div>
                            <span className="page-index"><bdi dir="ltr">{phaseLabel}</bdi></span>
                        </header>

                        <div className="workspace-toolbar" role="toolbar" aria-label="فرمان‌های صفحه" data-lg-role="dock">
                            {toolbar}
                        </div>

                        {isMasterDataResource(activeResource) && (
                            <nav className="master-data-tabs" aria-label="بخش‌های اطلاعات پایه">
                                {resourceLinks.filter((item) => item.id !== 'products').map((item) => (
                                    <a key={item.id} href={shellHref(item.href)} className={activeResource === item.id ? 'is-current' : ''} aria-current={activeResource === item.id ? 'page' : undefined}>
                                        {item.label}
                                    </a>
                                ))}
                            </nav>
                        )}
                        {isSalesResource(activeResource) && (
                            <nav className="master-data-tabs" aria-label="بخش‌های فروش">
                                {salesLinks.map((item) => (
                                    <a key={item.id} href={shellHref(item.href)} className={activeResource === item.id ? 'is-current' : ''} aria-current={activeResource === item.id ? 'page' : undefined}>
                                        {item.label}
                                    </a>
                                ))}
                            </nav>
                        )}
                        {isStockResource(activeResource) && (
                            <nav className="master-data-tabs" aria-label="بخش‌های انبار">
                                {stockLinks.map((item) => (
                                    <a key={item.id} href={shellHref(item.href)} className={activeResource === item.id ? 'is-current' : ''} aria-current={activeResource === item.id ? 'page' : undefined}>
                                        {item.label}
                                    </a>
                                ))}
                            </nav>
                        )}
                        {isPurchasingResource(activeResource) && (
                            <nav className="master-data-tabs" aria-label="بخش‌های خرید">
                                {purchasingLinks.map((item) => (
                                    <a key={item.id} href={shellHref(item.href)} className={activeResource === item.id ? 'is-current' : ''} aria-current={activeResource === item.id ? 'page' : undefined}>
                                        {item.label}
                                    </a>
                                ))}
                            </nav>
                        )}
                        {isAccountingResource(activeResource) && (
                            <nav className="master-data-tabs" aria-label="بخش‌های حسابداری">
                                {accountingLinks.map((item) => (
                                    <a key={item.id} href={shellHref(item.href)} className={activeResource === item.id ? 'is-current' : ''} aria-current={activeResource === item.id ? 'page' : undefined}>{item.label}</a>
                                ))}
                            </nav>
                        )}
                        {isSettlementResource(activeResource) && (
                            <nav className="master-data-tabs" aria-label="بخش‌های صورتحساب و تسویه">
                                {settlementLinks.map((item) => (
                                    <a key={item.id} href={shellHref(item.href)} className={activeResource === item.id ? 'is-current' : ''} aria-current={activeResource === item.id ? 'page' : undefined}>{item.label}</a>
                                ))}
                            </nav>
                        )}

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
                    <a className={activeResource === 'products' && activePage === 'list' ? 'is-current' : ''} href={shellHref('/products')} aria-current={activeResource === 'products' && activePage === 'list' ? 'page' : undefined}>
                        <NavGlyph kind="list" />
                        <span>فهرست</span>
                    </a>
                    {detailHref && (
                        <a className={activeResource === 'products' && activePage === 'detail' ? 'is-current' : ''} href={detailHref} aria-current={activeResource === 'products' && activePage === 'detail' ? 'page' : undefined}>
                            <NavGlyph kind="detail" />
                            <span>جزئیات</span>
                        </a>
                    )}
                    {isDashboardResource(activeResource) && (
                        <a className="is-current" href={shellHref('/dashboard')} aria-current="page">
                            <NavGlyph kind="list" />
                            <span>گزارش</span>
                        </a>
                    )}
                    {isMasterDataResource(activeResource) && (
                        <a className="is-current" href={shellHref('/parties')} aria-label="فهرست طرف‌های تجاری" aria-current="page">
                            <NavGlyph kind="list" />
                            <span>اطلاعات پایه</span>
                        </a>
                    )}
                    {isSalesResource(activeResource) && (
                        <a className="is-current" href={shellHref(activeListHref(activeResource))} aria-label={activeListLabel(activeResource)} aria-current="page">
                            <NavGlyph kind="list" />
                            <span>{activeListLabel(activeResource)}</span>
                        </a>
                    )}
                    {isStockResource(activeResource) && (
                        <a className="is-current" href={shellHref(activeStockHref(activeResource))} aria-label={activeStockLabel(activeResource)} aria-current="page">
                            <NavGlyph kind="list" />
                            <span>{activeStockLabel(activeResource)}</span>
                        </a>
                    )}
                    {isPurchasingResource(activeResource) && (
                        <a className="is-current" href={shellHref(activePurchasingHref(activeResource))} aria-label={activePurchasingLabel(activeResource)} aria-current="page">
                            <NavGlyph kind="list" />
                            <span>{activePurchasingLabel(activeResource)}</span>
                        </a>
                    )}
                    {isAccountingResource(activeResource) && (
                        <a className="is-current" href={shellHref(activeAccountingHref(activeResource))} aria-label={activeAccountingLabel(activeResource)} aria-current="page">
                            <NavGlyph kind="list" />
                            <span>{activeAccountingLabel(activeResource)}</span>
                        </a>
                    )}
                    {isSettlementResource(activeResource) && (
                        <a className="is-current" href={shellHref(activeSettlementHref(activeResource))} aria-label={activeSettlementLabel(activeResource)} aria-current="page">
                            <NavGlyph kind="list" />
                            <span>{activeSettlementLabel(activeResource)}</span>
                        </a>
                    )}
                </LiquidGlass>

                <footer className="workspace-footer">
                    <span>محیط توسعهٔ محلی</span>
                    <span><bdi dir="ltr">{activeResource === 'products' ? 'GET /api/v1/products' : activeResource === 'dashboard' ? 'GET /api/v1/dashboard' : activeResource === 'orders' ? 'GET /api/v1/sales-orders' : activeResource === 'follow-ups' ? 'GET /api/v1/lead-activities/overdue' : activeResource === 'stock' ? 'GET /api/v1/stock/balances' : activeResource === 'stock-movements' ? 'GET /api/v1/stock/movements' : activeResource === 'stock-reservations' ? 'GET /api/v1/stock/reservations' : activeResource === 'accounting' ? 'GET /api/v1/accounting/journals' : `GET /api/v1/${activeResource}`}</bdi></span>
                </footer>
            </div>
        </main>
    );
}
