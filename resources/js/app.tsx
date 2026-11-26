import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { ProductsScreen } from './screens/ProductsScreen';
import { SignInScreen } from './screens/SignInScreen';
import { AccessDeniedScreen } from './screens/AccessDeniedScreen';
import { MasterDataScreen } from './screens/MasterDataScreen';
import { SalesScreen } from './screens/SalesScreen';
import { StockScreen } from './screens/StockScreen';
import { PurchasingScreen } from './screens/PurchasingScreen';
import { AccountingScreen } from './screens/AccountingScreen';
import { SettlementScreen } from './screens/SettlementScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import '../css/app.css';
import '../css/purchases.css';
import '../css/accounting.css';
import '../css/settlements.css';
import '../css/dashboard.css';
import '../css/project-work.css';

const root = document.getElementById('app');
const ProjectWorkScreen = lazy(() => import('./screens/ProjectWorkScreen').then((module) => ({ default: module.ProjectWorkScreen })));

if (!root) {
    throw new Error('The application mount point is missing.');
}

const scene = new URLSearchParams(window.location.search).get('scene') === 'bright' ? 'bright' : 'dark';
document.documentElement.dataset.lgScene = scene;
const isMasterDataRoute = /^\/(parties|units|warehouses|locations|price-lists)(?:\/(?:new|\d+))?\/?$/.test(window.location.pathname);
const isSalesRoute = /^\/(leads|follow-ups|quotes|orders)(?:\/(?:new|\d+))?\/?$/.test(window.location.pathname);
const isStockRoute = /^\/stock(?:\/(?:movements|reservations))?\/?$/.test(window.location.pathname);
const isPurchasingRoute = /^\/(purchase-requests|purchase-orders)(?:\/(?:new|\d+))?\/?$/.test(window.location.pathname);
const isAccountingRoute = /^\/accounting(?:\/journals(?:\/(?:new|\d+))?)?\/?$/.test(window.location.pathname);
const isSettlementRoute = /^\/settlements\/?$/.test(window.location.pathname);
const isDashboardRoute = /^\/dashboard\/?$/.test(window.location.pathname);
const isProjectWorkRoute = /^\/(?:projects(?:\/\d+(?:\/tasks\/\d+)?)?|inbox)\/?$/.test(window.location.pathname);

createRoot(root).render(
    <StrictMode>
        {root.dataset.page === 'sign-in' ? <SignInScreen /> : root.dataset.page === 'denied' ? <AccessDeniedScreen /> : isProjectWorkRoute ? <Suspense fallback={<main className="work-loading" data-lg-role="stage"><p>در حال آماده‌سازی فضای پروژه و کار…</p></main>}><ProjectWorkScreen /></Suspense> : isDashboardRoute ? <DashboardScreen /> : isStockRoute ? <StockScreen /> : isSettlementRoute ? <SettlementScreen /> : isAccountingRoute ? <AccountingScreen /> : isPurchasingRoute ? <PurchasingScreen /> : isSalesRoute ? <SalesScreen /> : isMasterDataRoute ? <MasterDataScreen /> : <ProductsScreen />}
    </StrictMode>,
);
