import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { apiErrorMessage } from '../../api/client';
import { Alert, Button, Panel } from '../../components/ui';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirmPassword: '', phone: '', address: '',
    bloodGroup: '', doctorUniqueId: '', surgeryName: '', recoveryTotalDays: 14,
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

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (form.password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

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

  return (
    <main className="min-h-screen bg-[var(--color-parchment)] px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-6 flex items-start justify-between gap-4 sm:mb-8">
          <div>
            <Link to="/login" className="inline-flex items-center gap-3 text-[var(--color-ink)] no-underline">
              <SealMark />
              <span className="font-display text-xl font-semibold sm:text-2xl">CasterlyCare</span>
            </Link>
            <p className="mt-3 max-w-2xl text-sm text-[var(--color-text-soft)]">
              Create your patient account using the unique doctor ID provided by your treating surgeon.
            </p>
          </div>
          <Link to="/login" className="hidden text-sm font-semibold text-[var(--color-crimson)] sm:inline-flex">
            Back to sign in
          </Link>
        </header>

        <Panel className="overflow-hidden p-0">
          <div className="border-b border-[var(--color-line)] bg-[linear-gradient(135deg,rgba(122,31,43,0.07),rgba(169,127,43,0.08))] px-5 py-5 sm:px-8">
            <p className="eyebrow text-[var(--color-gold)]">Patient onboarding</p>
            <h1 className="mt-1 text-2xl sm:text-3xl">Set up your recovery workspace</h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--color-text-soft)]">
              Your doctor ID connects this signup to the current recovery episode. Your previous surgeries remain part of your permanent history, while doctor assignment can change for future care.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8 p-5 sm:p-8">
            <section>
              <SectionTitle number="01" title="Personal details" description="These details appear in your patient profile and help the care team identify you correctly." />
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Full name" htmlFor="signup-name" required>
                  <input id="signup-name" required autoComplete="name" className="field-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Your full name" />
                </Field>
                <Field label="Phone" htmlFor="signup-phone">
                  <input id="signup-phone" type="tel" inputMode="tel" autoComplete="tel" className="field-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="Contact number" />
                </Field>
                <Field label="Email address" htmlFor="signup-email" required>
                  <input id="signup-email" type="email" required autoComplete="email" className="field-input" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@example.com" />
                </Field>
                <Field label="Blood group" htmlFor="signup-blood">
                  <select id="signup-blood" className="field-select" value={form.bloodGroup} onChange={(e) => set('bloodGroup', e.target.value)}>
                    <option value="">Select blood group</option>
                    {BLOOD_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
                  </select>
                </Field>
                <Field label="Address" htmlFor="signup-address" className="sm:col-span-2">
                  <input id="signup-address" autoComplete="street-address" className="field-input" value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Residential address" />
                </Field>
              </div>
            </section>

            <section className="border-t border-[var(--color-line)] pt-7">
              <SectionTitle number="02" title="Account security" description="Use a private password that you will remember for future sign-ins and protected health-record access." />
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Password" htmlFor="signup-password" required hint="Minimum 6 characters.">
                  <input id="signup-password" type="password" required minLength={6} autoComplete="new-password" className="field-input" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Create a password" />
                </Field>
                <Field label="Confirm password" htmlFor="signup-confirm" required error={passwordMismatch ? 'Passwords do not match.' : ''}>
                  <input id="signup-confirm" type="password" required minLength={6} autoComplete="new-password" className="field-input" value={form.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)} placeholder="Re-enter your password" aria-invalid={passwordMismatch} />
                </Field>
              </div>
            </section>

            <section className="border-t border-[var(--color-line)] pt-7">
              <SectionTitle number="03" title="Current recovery episode" description="Your surgeon's unique doctor ID and the procedure details establish the current care episode." />
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Doctor's unique ID" htmlFor="signup-doctor" required hint="Example: DOC-XXXXXX" className="sm:col-span-2">
                  <input id="signup-doctor" required aria-describedby="signup-doctor-help" autoCapitalize="characters" spellCheck="false" className="field-input uppercase tracking-[0.08em]" value={form.doctorUniqueId} onChange={(e) => set('doctorUniqueId', e.target.value.toUpperCase())} placeholder="DOC-XXXXXX" />
                </Field>
                <Field label="Surgery / procedure" htmlFor="signup-surgery" required className="sm:col-span-2">
                  <input id="signup-surgery" required className="field-input" value={form.surgeryName} onChange={(e) => set('surgeryName', e.target.value)} placeholder="Procedure or surgery name" />
                </Field>
              </div>
              <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-parchment-wash)] px-4 py-3 text-sm text-[var(--color-text-soft)]">
                <strong className="text-[var(--color-ink)]">About the doctor link:</strong> this connects you to your current recovery episode. It does not prevent you from being mapped to another surgeon for a later surgery. Your surgeon sets and can adjust your exact recovery duration in your patient record.
              </div>
            </section>

            {error && (
              <div ref={errorRef} tabIndex={-1} role="alert" aria-live="assertive">
                <Alert variant="danger">{error}</Alert>
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 border-t border-[var(--color-line)] pt-6 sm:flex-row sm:items-center sm:justify-between">
              <Link to="/login" className="text-center text-sm font-semibold text-[var(--color-crimson)] sm:text-left">
                Already have an account? Sign in
              </Link>
              <Button type="submit" variant="primary" disabled={busy || passwordMismatch} loading={busy} className="min-w-44 justify-center">
                {busy ? 'Creating account…' : 'Create patient account'}
              </Button>
            </div>
          </form>
        </Panel>

        <p className="mx-auto mt-5 max-w-3xl text-center text-xs leading-relaxed text-[var(--color-muted)]">
          By creating an account, you are setting up access to your CasterlyCare recovery workspace. Automated monitoring and application features support care delivery; they do not replace clinical judgment.
        </p>
      </div>
    </main>
  );
}

function SectionTitle({ number, title, description }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-[var(--color-gold)] px-2 text-xs font-bold text-[var(--color-gold)]">{number}</span>
      <div>
        <h2 className="text-xl sm:text-2xl">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--color-text-soft)]">{description}</p>
      </div>
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

function SealMark() {
  return (
    <svg aria-hidden="true" width="34" height="34" viewBox="0 0 34 34" fill="none">
      <circle cx="17" cy="17" r="16" stroke="var(--color-gold-light)" strokeWidth="1.5" />
      <circle cx="17" cy="17" r="11" fill="none" stroke="var(--color-gold-light)" strokeWidth="1" />
      <path d="M17 9 L20 16 L27 17 L20 18 L17 25 L14 18 L7 17 L14 16 Z" fill="var(--color-gold-light)" />
    </svg>
  );
}
