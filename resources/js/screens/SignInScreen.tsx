import { useState, type FormEvent } from 'react';
import { signIn } from '../api/products';
import { GlassButton } from '../components/GlassButton';
import { LiquidGlass } from '../liquid-glass/LiquidGlass.jsx';

export function SignInScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSubmitting(true);
        setError('');

        try {
            await signIn(email, password);
        } catch (cause) {
            const message = cause instanceof Error ? cause.message : '';
            setError(message.includes('429')
                ? 'تلاش‌های ورود زیاد بوده است. کمی بعد دوباره امتحان کنید.'
                : 'ایمیل یا گذرواژه معتبر نیست.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main className="app-shell auth-stage" data-lg-role="stage">
            <div className="auth-brand">
                <span className="brand-mark" aria-hidden="true">E</span>
                <div><span className="brand-kicker">فضای کاری محلی</span><strong>ERP</strong></div>
            </div>
            <LiquidGlass className="auth-card" variant="regular" radius={24} profile="soft" strength={105} magnify={1.04} dispersion={0.008} blur={0.3} data-lg-role="focus">
                <p className="eyebrow">ورود امن به فضای کاری</p>
                <h1>خوش آمدید</h1>
                <p className="auth-copy">برای دیدن اطلاعات سازمانی خود وارد شوید.</p>
                <form className="auth-form" onSubmit={submit}>
                    <label htmlFor="sign-in-email">ایمیل</label>
                    <input
                        id="sign-in-email"
                        name="email"
                        type="email"
                        autoComplete="username"
                        inputMode="email"
                        value={email}
                        required
                        onChange={(event) => setEmail(event.currentTarget.value)}
                    />
                    <label htmlFor="sign-in-password">گذرواژه</label>
                    <input
                        id="sign-in-password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        required
                        onChange={(event) => setPassword(event.currentTarget.value)}
                    />
                    {error && <p className="auth-error" role="alert">{error}</p>}
                    <GlassButton className="auth-submit" type="submit" variant="tinted" disabled={submitting}>
                        {submitting ? 'در حال ورود' : 'ورود'}
                    </GlassButton>
                </form>
                <p className="auth-local-note">محیط توسعهٔ محلی · داده‌های آزمایشی</p>
            </LiquidGlass>
        </main>
    );
}
