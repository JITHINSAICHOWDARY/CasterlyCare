import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { roleHome } from '../../config/navigation';
import { normalizeApiError } from '../../api/errors';
import { Button, Alert } from '../../components/ui';
import SmoothInput from '../../components/SmoothInput';
import lionMark from '../../assets/lion-mark.png';
import AudioWaveform from './AudioWaveform';
import CloudSky from './CloudSky';

// Three.js + the skeleton model are only loaded when the login page renders,
// not as part of every page's shared bundle.
const AnatomyModel = lazy(() => import('./AnatomyModel'));

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
  const { login, requestOtp, loginWithOtp, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // The skeleton's camera framing is tuned for a wide desktop layout (model
  // beside a right-pinned card); on a narrow phone it'd render mis-composed
  // and cost a WebGL context + Draco decode + a multi-MB fetch for nothing.
  const [showAnatomyModel, setShowAnatomyModel] = useState(() => window.innerWidth >= 640);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const handler = () => setShowAnatomyModel(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const [mode, setMode] = useState('password'); // 'password' | 'otp'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const errorRef = useRef(null);

  const [otpStage, setOtpStage] = useState('phone'); // 'phone' | 'code'
  const [otpPhone, setOtpPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpDevCode, setOtpDevCode] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [resendCountdown, setResendCountdown] = useState(0);

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

  // Ticks the "Resend OTP in 0:45" countdown until it reaches zero.
  useEffect(() => {
    if (!resendAt) return undefined;
    const tick = () => setResendCountdown(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [resendAt]);

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

  async function handleOtpRequest(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await requestOtp(otpPhone);
      setResendAt(Date.now() + (res.data?.resendInSeconds || 45) * 1000);
      setOtpDevCode(res.data?.devCode || '');
      setOtpCode('');
      setOtpStage('code');
    } catch (err) {
      setError(getLoginError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleOtpVerify(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await loginWithOtp(otpPhone, otpCode);
      navigate(resolveSafeDestination(from, user.role), { replace: true });
    } catch (err) {
      setError(getLoginError(err));
    } finally {
      setBusy(false);
    }
  }

  // Memoized: GoogleButton's effect depends on this reference, and the
  // OTP resend countdown re-renders Login every second — an unmemoized
  // function here would re-run that effect (re-init the Google button)
  // on every tick.
  const handleGoogleCredential = useCallback(async (credential) => {
    setError('');
    setBusy(true);
    try {
      const user = await loginWithGoogle(credential);
      navigate(resolveSafeDestination(from, user.role), { replace: true });
    } catch (err) {
      setError(getLoginError(err));
    } finally {
      setBusy(false);
    }
  }, [loginWithGoogle, navigate, from]);

  function switchMode(next) {
    setMode(next);
    setError('');
    setOtpStage('phone');
  }

  return (
    <div className="login-shell">
      <CloudSky style={{ position: 'absolute', inset: 0 }} />
      <AudioWaveform />
      <div className="login-rings" aria-hidden="true"><span /><span /><span /><span /></div>
      {showAnatomyModel && (
        <Suspense fallback={null}>
          <AnatomyModel className="login-heart" />
        </Suspense>
      )}

      <div className="login-content">
        <div className="login-brand">
          <img src={lionMark} alt="" className="login-mark h-11 w-auto sm:h-16" aria-hidden="true" />
          <span className="font-display text-3xl tracking-wide sm:text-4xl">
            <span className="text-white">Casterly</span>
            <span style={{ color: '#D9B25A' }}>Care</span>
          </span>
        </div>
        <p className="login-tagline">A Lannister always pays his debts, and CasterlyCare always protects your health.</p>

        <div className="login-card login-card-enter">
          <h2 className="font-display text-2xl text-[var(--color-ink)] mb-1">Sign in</h2>
          <p className="text-sm text-[var(--color-text-soft)] mb-5">
            {mode === 'password' ? 'Sign in with your email and password.' : 'Sign in with your phone number using a one-time code.'}
          </p>

          <div className="login-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'password'} className={mode === 'password' ? 'active' : ''} onClick={() => switchMode('password')}>
              Password
            </button>
            <button type="button" role="tab" aria-selected={mode === 'otp'} className={mode === 'otp' ? 'active' : ''} onClick={() => switchMode('otp')}>
              OTP (One-Time Passcode)
            </button>
          </div>

          {error && (
            <div id="login-error" ref={errorRef} tabIndex={-1} role="alert" aria-live="assertive" className="mb-4">
              <Alert variant={sessionExpired ? 'warning' : 'danger'}>{error}</Alert>
            </div>
          )}

          {mode === 'password' ? (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label className="field-label" htmlFor="login-email">Email address</label>
                <SmoothInput
                  id="login-email" type="email" inputMode="email" autoCapitalize="none" spellCheck="false" autoComplete="username" required value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-invalid={Boolean(error)} aria-describedby={error ? 'login-error' : undefined}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="login-password">Password</label>
                <SmoothInput
                  id="login-password" type="password" autoComplete="current-password" required value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" aria-describedby={error ? 'login-error' : undefined} />
              </div>
              <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          ) : otpStage === 'phone' ? (
            <form onSubmit={handleOtpRequest} className="space-y-4" noValidate>
              <div>
                <label className="field-label" htmlFor="login-otp-phone">Mobile number</label>
                <div className="phone-input">
                  <span className="phone-input-prefix">+91</span>
                  <SmoothInput
                    id="login-otp-phone" type="tel" inputMode="numeric" autoComplete="tel-national" required maxLength={10} value={otpPhone}
                    onChange={(e) => setOtpPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile number" aria-describedby={error ? 'login-error' : undefined}
                  />
                </div>
              </div>
              <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={busy}>
                {busy ? 'Sending code…' : 'Send code'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleOtpVerify} className="space-y-4" noValidate>
              <div>
                <div className="flex items-baseline justify-between">
                  <label className="field-label" htmlFor="login-otp-code">One-time passcode (OTP)</label>
                  <button
                    type="button" className="text-xs font-semibold text-[var(--color-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={resendCountdown > 0 || busy} onClick={handleOtpRequest}
                  >
                    {resendCountdown > 0 ? `Resend in 0:${String(resendCountdown).padStart(2, '0')}` : 'Resend code'}
                  </button>
                </div>
                <OtpBoxes id="login-otp-code" value={otpCode} onChange={setOtpCode} disabled={busy} />
                {otpDevCode && (
                  <p className="text-xs text-[var(--color-muted)] mt-1.5">Dev mode (no SMS provider configured) — code: {otpDevCode}</p>
                )}
              </div>
              <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={busy || otpCode.length !== 6}>
                {busy ? 'Verifying…' : 'Sign in'}
              </Button>
              <button type="button" className="text-xs text-[var(--color-text-soft)]" onClick={() => setOtpStage('phone')}>
                &larr; Use a different phone number
              </button>
            </form>
          )}

          {googleClientId && (
            <>
              <div className="login-divider"><span>or sign in with</span></div>
              <GoogleButton clientId={googleClientId} onCredential={handleGoogleCredential} />
            </>
          )}

          <p className="text-sm text-[var(--color-text-soft)] mt-6 text-center">
            New patient with a doctor's ID?{' '}
            <Link to="/signup" className="text-[var(--color-crimson)] font-semibold">Create an account</Link>
          </p>
        </div>

        <p className="login-footnote">&copy; {new Date().getFullYear()} CasterlyCare. All rights reserved.</p>
        <p className="login-footnote">Developed by Myneni Jithin Sai</p>
        <p className="login-footnote login-legal"><Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms</Link> · <Link to="/contact">Contact</Link></p>
        <p className="login-credit">Anatomy models: BodyParts3D/Z-Anatomy &amp; Anatria-3D, CC BY-SA</p>
      </div>
    </div>
  );
}

// Six single-digit boxes backed by one string value, auto-advancing focus —
// the OTP entry pattern from the reference design.
function OtpBoxes({ id, value, onChange, disabled }) {
  const refs = useRef([]);

  function setDigit(index, digit) {
    const chars = value.padEnd(6, ' ').split('');
    chars[index] = digit;
    onChange(chars.join('').trimEnd());
  }

  function handleChange(index, e) {
    const digit = e.target.value.replace(/\D/g, '').slice(-1);
    setDigit(index, digit || '');
    if (digit && refs.current[index + 1]) refs.current[index + 1].focus();
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace' && !value[index] && refs.current[index - 1]) {
      refs.current[index - 1].focus();
    }
  }

  function handlePaste(e) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    refs.current[Math.min(pasted.length, 5)]?.focus();
  }

  return (
    <div id={id} className="otp-boxes" onPaste={handlePaste}>
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text" inputMode="numeric" pattern="[0-9]*" maxLength={1} autoComplete={i === 0 ? 'one-time-code' : 'off'}
          className="otp-box" value={value[i] || ''} onChange={(e) => handleChange(i, e)} onKeyDown={(e) => handleKeyDown(i, e)}
          disabled={disabled} aria-label={`Digit ${i + 1} of 6`}
        />
      ))}
    </div>
  );
}

// Renders Google's own Identity Services button — nothing to style ourselves,
// it just needs the script (loaded in index.html) and a client ID.
function GoogleButton({ clientId, onCredential }) {
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    function tryRender() {
      if (cancelled) return;
      if (window.google?.accounts?.id && containerRef.current) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => onCredential(response.credential),
        });
        // Google's width is a fixed pixel value (200-400), not a percentage —
        // a hardcoded 320 overflows the card on phones narrower than ~380px.
        const width = Math.round(Math.min(320, Math.max(200, containerRef.current.getBoundingClientRect().width)));
        window.google.accounts.id.renderButton(containerRef.current, {
          type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', width,
        });
        return;
      }
      attempts += 1;
      if (attempts < 50) setTimeout(tryRender, 100); // script tag is async; retry briefly while it loads
    }

    tryRender();
    return () => { cancelled = true; };
  }, [clientId, onCredential]);

  return <div ref={containerRef} className="login-google-btn" />;
}
