import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { apiErrorMessage } from '../../api/client';
import { Alert, Button } from '../../components/ui';
import SmoothInput from '../../components/SmoothInput';
import lionMark from '../../assets/lion-mark.png';
import CloudSky from './CloudSky';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const STEPS = ['Personal details', 'Password', 'Doctor ID'];

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirmPassword: '', phone: '', address: '',
    bloodGroup: '', doctorUniqueId: '', acceptedTerms: false,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const errorRef = useRef(null);

  const passwordMismatch = useMemo(
    () => form.confirmPassword.length > 0 && form.password !== form.confirmPassword,
    [form.password, form.confirmPassword],
  );

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function set(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (step === 1) {
      if (form.password.length < 6) return setError('Password must be at least 6 characters long.');
      if (form.password !== form.confirmPassword) return setError('Passwords do not match.');
    }

    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
      return;
    }

    createAccount();
  }

  async function createAccount() {
    setBusy(true);
    try {
      const { confirmPassword: _, ...payload } = form;
      await signup(payload);
      navigate('/patient', { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function goBack() {
    setError('');
    setStep((s) => Math.max(0, s - 1));
  }

  return (
    <main className="login-shell signup-shell">
      <CloudSky style={{ position: 'absolute', inset: 0 }} />
      <div className="login-rings" aria-hidden="true"><span /><span /><span /><span /></div>
      <div className="login-content">
        <Link to="/login" className="login-brand no-underline">
          <img src={lionMark} alt="" className="login-mark h-11 w-auto sm:h-16" aria-hidden="true" />
          <span className="font-display text-2xl tracking-wide sm:text-4xl">
            <span className="text-white">Casterly</span>
            <span style={{ color: '#D9B25A' }}>Care</span>
          </span>
        </Link>

        <StepDots current={step} />

        <div className="login-card login-card-enter mt-6">
          <h3>{STEPS[step]}</h3>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {step === 0 && (
              <>
                <Field label="Full name" htmlFor="signup-name" required>
                  <SmoothInput id="signup-name" required autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Your full name" />
                </Field>
                <Field label="Email address" htmlFor="signup-email" required>
                  <SmoothInput id="signup-email" type="email" required autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@example.com" />
                </Field>
                <Field label="Phone" htmlFor="signup-phone">
                  <div className="phone-input">
                    <span className="phone-input-prefix">+91</span>
                    <SmoothInput
                      id="signup-phone" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10} value={form.phone}
                      onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile number"
                    />
                  </div>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Blood group" htmlFor="signup-blood">
                    <select id="signup-blood" className="field-select" value={form.bloodGroup} onChange={(e) => set('bloodGroup', e.target.value)}>
                      <option value="">Select</option>
                      {BLOOD_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
                    </select>
                  </Field>
                  <Field label="Address" htmlFor="signup-address">
                    <SmoothInput id="signup-address" autoComplete="street-address" value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Optional" />
                  </Field>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <Field label="Password" htmlFor="signup-password" required hint="Minimum 6 characters.">
                  <SmoothInput id="signup-password" type="password" required minLength={6} autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Create a password" />
                </Field>
                <Field label="Confirm password" htmlFor="signup-confirm" required error={passwordMismatch ? 'Passwords do not match.' : ''}>
                  <SmoothInput id="signup-confirm" type="password" required minLength={6} autoComplete="new-password" value={form.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)} placeholder="Re-enter your password" aria-invalid={passwordMismatch} />
                </Field>
              </>
            )}

            {step === 2 && (
              <>
                <Field label="Doctor's unique ID" htmlFor="signup-doctor" required hint="Given to you by your surgeon, e.g. DOC-XXXXXX">
                  <SmoothInput id="signup-doctor" required autoCapitalize="characters" spellCheck="false" className="uppercase tracking-[0.08em]" value={form.doctorUniqueId} onChange={(e) => set('doctorUniqueId', e.target.value.toUpperCase())} placeholder="DOC-XXXXXX" />
                </Field>

                <label className="consent-check">
                  <input type="checkbox" required checked={form.acceptedTerms} onChange={(e) => set('acceptedTerms', e.target.checked)} />
                  <span>
                    I agree to the <Link to="/terms" target="_blank" rel="noreferrer">Terms and Conditions</Link> and the{' '}
                    <Link to="/privacy" target="_blank" rel="noreferrer">Privacy Policy</Link>, and consent to CasterlyCare using my health information to coordinate my care.
                  </span>
                </label>
              </>
            )}

            {error && (
              <div ref={errorRef} tabIndex={-1} role="alert" aria-live="assertive">
                <Alert variant="danger">{error}</Alert>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2">
              {step > 0 ? (
                <Button type="button" variant="outline" onClick={goBack}>Back</Button>
              ) : (
                <Link to="/login" className="btn btn-outline btn-sm">Sign in instead</Link>
              )}
              <Button type="submit" variant="primary" disabled={busy || (step === 1 && passwordMismatch) || (step === STEPS.length - 1 && !form.acceptedTerms)} loading={busy} className="min-w-32 justify-center">
                {step < STEPS.length - 1 ? 'Next' : busy ? 'Creating…' : 'Create account'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

function StepDots({ current }) {
  return (
    <div className="mt-6 flex items-center justify-center gap-2" aria-hidden="true">
      {STEPS.map((label, i) => (
        <span
          key={label}
          className="h-1.5 rounded-full transition-all"
          style={{
            width: i === current ? '1.75rem' : '0.5rem',
            background: i <= current ? 'var(--color-crimson)' : 'var(--color-line)',
          }}
        />
      ))}
    </div>
  );
}

function Field({ label, htmlFor, required, hint, error, className = '', children }) {
  return (
    <div className={className}>
      <label className="field-label" htmlFor={htmlFor}>{label}{required && <span className="ml-1 text-[var(--color-crimson)]">*</span>}</label>
      <div className="mt-1.5">{children}</div>
      {error ? <p className="mt-1.5 text-xs font-medium text-[var(--color-danger)]">{error}</p> : hint ? <p className="mt-1.5 text-xs text-[var(--color-muted)]">{hint}</p> : null}
    </div>
  );
}
