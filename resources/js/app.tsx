import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ProductsScreen } from './screens/ProductsScreen';
import { SignInScreen } from './screens/SignInScreen';
import { AccessDeniedScreen } from './screens/AccessDeniedScreen';
import { MasterDataScreen } from './screens/MasterDataScreen';
import '../css/app.css';

const root = document.getElementById('app');

if (!root) {
    throw new Error('The application mount point is missing.');
}

const scene = new URLSearchParams(window.location.search).get('scene') === 'bright' ? 'bright' : 'dark';
document.documentElement.dataset.lgScene = scene;
const isMasterDataRoute = /^\/(parties|units|warehouses|locations|price-lists)(?:\/(?:new|\d+))?\/?$/.test(window.location.pathname);

createRoot(root).render(
    <StrictMode>
        {root.dataset.page === 'sign-in' ? <SignInScreen /> : root.dataset.page === 'denied' ? <AccessDeniedScreen /> : isMasterDataRoute ? <MasterDataScreen /> : <ProductsScreen />}
    </StrictMode>,
);
