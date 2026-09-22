import { useState } from 'react';
import { authService } from '../api/services/auth';
import { TOKEN_KEY, apiErrorMessage } from '../api/client';
import { Panel, Button, Alert } from './ui';

// Shared by every role. The form stays hidden until "Change password" is
// pressed, so the page shows nothing to edit by default.
export default function ChangePasswordCard() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && confirm !== next;
  const sameAsOld = next.length > 0 && next === current;
  const ready = current && next.length >= 8 && confirm === next && !sameAsOld && !busy;

  function close() {
    setOpen(false);
    setCurrent(''); setNext(''); setConfirm('');
    setError('');
  }

  async function submit(e) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      const res = await authService.changePassword(current, next);
      // The server signs out every older session; keep this one going.
      if (res.data?.token) localStorage.setItem(TOKEN_KEY, res.data.token);
      close();
      setDone(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Password"
      subtitle="Changing it signs you out on your other devices."
      action={!open ? <Button variant="outline" onClick={() => { setDone(false); setOpen(true); }}>Change password</Button> : null}
    >
      {done ? <div role="status"><Alert variant="success">Password changed. Your other devices have been signed out.</Alert></div> : null}
      {!open && !done ? <p className="text-sm text-[var(--color-text-soft)]">Your password is hidden for your security.</p> : null}

      {open ? (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <label className="field-label" htmlFor="pw-current">Current password</label>
            <input id="pw-current" type="password" autoComplete="current-password" className="field-input" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label" htmlFor="pw-new">New password</label>
              <input id="pw-new" type="password" autoComplete="new-password" maxLength={72} className="field-input" value={next} onChange={(e) => setNext(e.target.value)} aria-invalid={tooShort || sameAsOld} />
              {tooShort ? <p className="field-error">Use at least 8 characters.</p> : sameAsOld ? <p className="field-error">Choose a different password.</p> : <p className="field-count">8 to 72 characters</p>}
            </div>
            <div>
              <label className="field-label" htmlFor="pw-confirm">Confirm new password</label>
              <input id="pw-confirm" type="password" autoComplete="new-password" maxLength={72} className="field-input" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} />
              {mismatch ? <p className="field-error">Passwords do not match.</p> : null}
            </div>
          </div>
          {error ? <div role="alert"><Alert variant="danger">{error}</Alert></div> : null}
          <div className="flex gap-2 flex-wrap">
            <Button type="submit" variant="primary" loading={busy} disabled={!ready}>{busy ? 'Updating…' : 'Update password'}</Button>
            <Button type="button" variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
          </div>
        </form>
      ) : null}
    </Panel>
  );
}
