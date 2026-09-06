import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { roleHome } from '../../config/navigation';
import { normalizeApiError } from '../../api/errors';
import { Button, Alert } from '../../components/ui';

function resolveSafeDestination(from, role) {
  if (!from || typeof from !== 'string') return roleHome[role] || '/login';
  const normalized = from.startsWith('/') ? from : '/';
  const allowedPrefix = `/${role}`;
  return normalized === allowedPrefix || normalized.startsWith(`${allowedPrefix}/`)
    ? normalized
    : (roleHome[role] || '/login');
}

function getLoginError(err) {
  const error = normalizeApiError(err);
  if (error.status === 401) return 'The email or password is incorrect. Please check your details and try again.';
  if (error.kind === 'network') return 'We could not reach CasterlyCare. Check your connection and try again.';
  if (error.kind === 'timeout') return 'The sign-in request took too long. Please try again.';
  if (error.kind === 'server') return 'CasterlyCare is temporarily unavailable. Please try again in a moment.';
  return error.message || 'We could not sign you in. Please try again.';
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const errorRef = useRef(null);

  const sessionExpired = useMemo(
    () => new URLSearchParams(location.search).get('reason') === 'session-expired',
    [location.search],
  );
  const from = location.state?.from;

  useEffect(() => {
    if (sessionExpired) setError('Your secure session has expired. Please sign in again to continue.');
  }, [sessionExpired]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(email, password);
      navigate(resolveSafeDestination(from, user.role), { replace: true });
    } catch (err) {
      setError(getLoginError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-[var(--color-ink)]">
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-14 text-[var(--color-parchment)]">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <SealMark />
            <span className="font-display text-2xl tracking-wide">CasterlyCare</span>
          </div>
          <p className="text-sm text-white/50 mt-1">A Lannister always pays their debts &mdash; and always cares for their patients.</p>
        </div>
        <div className="max-w-md">
          <h1 className="font-display text-4xl leading-tight mb-4">Recovery, watched over<br />every single day.</h1>
          <p className="text-white/60 text-sm leading-relaxed">
            One connected care experience for patients, surgeons, and hospital administrators &mdash;
            appointments, medicines, lab reports, recovery monitoring, and emergencies, all in one place.
          </p>
        </div>
        <p className="text-xs text-white/30">&copy; {new Date().getFullYear()} CasterlyCare. All rights reserved.</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-[var(--color-parchment)]">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <SealMark />
            <span className="font-display text-2xl text-[var(--color-ink)]">CasterlyCare</span>
          </div>
          <h2 className="font-display text-2xl text-[var(--color-ink)] mb-1">Sign in</h2>
          <p className="text-sm text-[var(--color-text-soft)] mb-6">Sign in with the email and password provided for your account.</p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="field-label" htmlFor="login-email">Email address</label>
              <input
                id="login-email" type="email" inputMode="email" autoCapitalize="none" spellCheck="false" autoComplete="username" required className="field-input" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-invalid={Boolean(error)} aria-describedby={error ? 'login-error' : undefined}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="login-password">Password</label>
              <input
                id="login-password" type="password" autoComplete="current-password" required className="field-input" value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" aria-describedby={error ? 'login-error' : undefined} />
            </div>
            {error && (
              <div id="login-error" ref={errorRef} tabIndex={-1} role="alert" aria-live="assertive">
                <Alert variant={sessionExpired ? 'warning' : 'danger'}>{error}</Alert>
              </div>
            )}
            <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="text-sm text-[var(--color-text-soft)] mt-6 text-center">
            New patient with a doctor's ID?{' '}
            <Link to="/signup" className="text-[var(--color-crimson)] font-semibold">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function SealMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <circle cx="17" cy="17" r="16" stroke="var(--color-gold-light, #D9B45C)" strokeWidth="1.5" />
      <circle cx="17" cy="17" r="11" fill="none" stroke="var(--color-gold-light, #D9B45C)" strokeWidth="1" />
      <path d="M17 9 L20 16 L27 17 L20 18 L17 25 L14 18 L7 17 L14 16 Z" fill="var(--color-gold-light, #D9B45C)" />
    </svg>
  );
}
