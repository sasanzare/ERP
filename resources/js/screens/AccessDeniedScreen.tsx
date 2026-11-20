import { signOut } from '../api/products';
import { GlassButton } from '../components/GlassButton';
import { LiquidGlass } from '../liquid-glass/LiquidGlass.jsx';

export function AccessDeniedScreen() {
    async function exitSession() {
        try {
            await signOut();
        } finally {
            window.location.assign('/sign-in');
        }
    }

    return (
        <main className="app-shell auth-stage" data-lg-role="stage">
            <LiquidGlass className="auth-card denied-card" variant="regular" radius={24} profile="soft" strength={105} magnify={1.04} dispersion={0.008} blur={0.3} data-lg-role="focus">
                <span className="state-icon error-icon" aria-hidden="true">!</span>
                <p className="eyebrow">دسترسی سازمانی</p>
                <h1>دسترسی فعالی ندارید</h1>
                <p className="auth-copy">برای این حساب کاربری سازمان مجازی ثبت نشده است؛ مدیر سامانه می‌تواند عضویت شما را بررسی کند.</p>
                <GlassButton className="auth-submit" variant="tinted" onClick={exitSession}>خروج از حساب</GlassButton>
            </LiquidGlass>
        </main>
    );
}
