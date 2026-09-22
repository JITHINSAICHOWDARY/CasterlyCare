import { doctorService } from '../../api/services/doctor';
import { API_BASE, apiErrorMessage } from '../../api/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DoctorDashboardShell as DashboardShell } from '../../components/RoleDashboardShell';
import { Panel, Button, Badge, Alert, PageHeader, LoadingState, ConfirmModal, IconButton } from '../../components/ui';
import NavIcon from '../../components/NavIcon';
import ChangePasswordCard from '../../components/ChangePasswordCard';
import GlassLensFilter from '../../components/GlassLensFilter';
import { useAuth } from '../../context/AuthContext';

const LIMITS = { name: 100, specialization: 100, bio: 1000 };
const PHOTO_TYPES = ['image/jpeg', 'image/png'];
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

function formatMemberSince(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Not recorded';
}

function fieldsOf(data) {
  return {
    name: data?.name || '',
    phone: data?.phone || '',
    specialization: data?.specialization || '',
    bio: data?.bio || '',
  };
}

export default function DoctorProfile() {
  const { updateUserLocal } = useAuth();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [dutyBusy, setDutyBusy] = useState(false);
  const [confirmOffDuty, setConfirmOffDuty] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await doctorService.getProfile();
      setProfile(res.data);
      setForm(fieldsOf(res.data));
      setSaved(fieldsOf(res.data));
      setError('');
    } catch (err) {
      setError(err?.message || 'Unable to load your profile.');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const dirty = useMemo(() => Boolean(form && saved && JSON.stringify(form) !== JSON.stringify(saved)), [form, saved]);
  const phoneInvalid = Boolean(form?.phone) && form.phone.length !== 10;
  const nameMissing = form ? !form.name.trim() : false;
  const canSave = editing && dirty && !phoneInvalid && !nameMissing && !saving;

  // Closing or reloading the tab with unsaved edits asks first.
  useEffect(() => {
    if (!editing || !dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [editing, dirty]);

  // Free the preview image when it is replaced or the page closes.
  useEffect(() => () => { if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.url); }, [pendingPhoto]);

  function startEditing() {
    setNotice('');
    setEditing(true);
  }

  function stopEditing() {
    setForm(saved);
    setPendingPhoto(null);
    setEditing(false);
  }

  function setField(key, value) {
    setNotice('');
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await doctorService.updateProfile({ ...form, name: form.name.trim() });
      const next = { ...form, name: form.name.trim() };
      setForm(next);
      setSaved(next);
      updateUserLocal({ name: next.name });
      setNotice('Profile saved.');
      setEditing(false);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function applyDuty(next) {
    setDutyBusy(true);
    setError('');
    try {
      await doctorService.setDutyStatus(next);
      setProfile((current) => ({ ...current, dutyStatus: next }));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setDutyBusy(false);
      setConfirmOffDuty(false);
    }
  }

  function toggleDuty() {
    if (dutyBusy) return;
    if (profile.dutyStatus === 'on_duty') setConfirmOffDuty(true);
    else applyDuty('on_duty');
  }

  async function copyId() {
    const value = profile.uniqueDoctorId || '';
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const area = document.createElement('textarea');
      area.value = value;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function choosePhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type) || file.size > PHOTO_MAX_BYTES) {
      setError('Profile photo must be JPG or PNG and no larger than 5 MB.');
      return;
    }
    setError('');
    setPendingPhoto({ file, url: URL.createObjectURL(file) });
  }

  async function uploadPhoto() {
    if (!pendingPhoto || photoBusy) return;
    setPhotoBusy(true);
    setError('');
    const fd = new FormData();
    fd.append('photo', pendingPhoto.file);
    try {
      const res = await doctorService.uploadProfilePhoto(fd);
      setProfile((current) => ({ ...current, photoUrl: res.data.photoUrl }));
      updateUserLocal({ photoUrl: res.data.photoUrl });
      setPendingPhoto(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    if (photoBusy) return;
    setPhotoBusy(true);
    setError('');
    try {
      await doctorService.removeProfilePhoto();
      setProfile((current) => ({ ...current, photoUrl: null }));
      updateUserLocal({ photoUrl: null });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPhotoBusy(false);
    }
  }

  if (!profile || !form) return (
    <DashboardShell>
      {error ? <Panel><Alert variant="danger" title="Profile unavailable">{error}</Alert><div className="mt-4"><Button onClick={load}>Retry</Button></div></Panel> : <LoadingState label="Loading your profile…" rows={4} />}
    </DashboardShell>
  );

  const onDuty = profile.dutyStatus === 'on_duty';
  const shownPhoto = pendingPhoto ? pendingPhoto.url : profile.photoUrl ? `${API_BASE}${profile.photoUrl}` : '';

  return (
    <DashboardShell>
      <div className="doctor-profile-page">
      <GlassLensFilter />
      <PageHeader title="Your Profile" subtitle={form.specialization || 'Doctor'} />

      {error ? <div className="mb-5" role="alert"><Alert variant="danger" title="Something went wrong">{error}</Alert></div> : null}

      {/* Two aligned rows of equal-width, equal-height cards. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <Panel className="profile-identity flex flex-col items-center justify-start text-center">
          {shownPhoto ? (
            <img src={shownPhoto} alt="" className="w-24 h-24 rounded-full object-cover mb-3" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-[var(--color-crimson)] flex items-center justify-center text-white text-3xl font-semibold mb-3">
              {form.name?.[0]}
            </div>
          )}
          <input type="file" accept="image/jpeg,image/png" hidden ref={fileRef} onChange={choosePhoto} />
          {editing ? (
            pendingPhoto ? (
              <div className="flex gap-2 flex-wrap justify-center">
                <Button variant="primary" onClick={uploadPhoto} loading={photoBusy}>Save photo</Button>
                <Button variant="outline" onClick={() => setPendingPhoto(null)} disabled={photoBusy}>Cancel</Button>
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap justify-center">
                <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={photoBusy}>{profile.photoUrl ? 'Change photo' : 'Add photo'}</Button>
                {profile.photoUrl ? <Button variant="ghost" onClick={removePhoto} loading={photoBusy}>Remove</Button> : null}
              </div>
            )
          ) : (
            <p className="doctor-name-under">{form.name}</p>
          )}

          <div className="w-full border-t border-[var(--color-line)] mt-5 pt-5">
            <p className="field-label">Unique Doctor ID</p>
            <div className="doctor-id">
              <span className="doctor-id-value">{profile.uniqueDoctorId}</span>
              <Button variant="outline" size="sm" onClick={copyId}>{copied ? 'Copied' : 'Copy'}</Button>
            </div>
            <p className="text-xs text-[var(--color-text-soft)] mt-2" role="status" aria-live="polite">
              {copied ? 'Doctor ID copied.' : 'Give this to a patient after their surgery so they can sign up under your care.'}
            </p>
          </div>
        </Panel>

        <Panel
          title="Details"
          action={!editing ? <IconButton label="Edit profile" className="edit-btn" onClick={startEditing}><NavIcon name="edit" size={18} /></IconButton> : null}
        >
          {!editing ? (
            <>
              {notice ? <div className="mb-4" role="status"><Alert variant="success">{notice}</Alert></div> : null}
              <dl className="detail-list">
                <div><dt>Full name</dt><dd>{form.name}</dd></div>
                <div><dt>Phone</dt><dd>{form.phone ? `+91 ${form.phone}` : <span className="not-set">Not added</span>}</dd></div>
                <div><dt>Email</dt><dd className="break-words">{profile.email}</dd></div>
                <div><dt>Specialization</dt><dd>{form.specialization || <span className="not-set">Not added</span>}</dd></div>
                <div className="detail-wide"><dt>Bio</dt><dd className="whitespace-pre-wrap break-words">{form.bio || <span className="not-set">Not added</span>}</dd></div>
              </dl>
            </>
          ) : (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="field-label" htmlFor="doctor-name">Full name</label>
                  <input id="doctor-name" className="field-input" maxLength={LIMITS.name} value={form.name} onChange={(e) => setField('name', e.target.value)} aria-invalid={nameMissing} autoFocus />
                  {nameMissing ? <p className="field-error">Full name is required.</p> : null}
                </div>
                <div>
                  <label className="field-label" htmlFor="doctor-phone">Phone</label>
                  <div className="phone-input">
                    <span className="phone-input-prefix">+91</span>
                    <input
                      id="doctor-phone" type="tel" inputMode="numeric" maxLength={10} className="field-input" value={form.phone}
                      onChange={(e) => setField('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="10-digit mobile number" aria-invalid={phoneInvalid}
                    />
                  </div>
                  {phoneInvalid ? <p className="field-error">Enter all 10 digits.</p> : null}
                </div>
              </div>
              <div>
                <label className="field-label" htmlFor="doctor-email">Email</label>
                <input id="doctor-email" className="field-input bg-[var(--color-parchment-deep)]" value={profile.email} disabled />
              </div>
              <div>
                <label className="field-label" htmlFor="doctor-specialization">Specialization</label>
                <input id="doctor-specialization" className="field-input" maxLength={LIMITS.specialization} value={form.specialization} onChange={(e) => setField('specialization', e.target.value)} />
                <p className="field-count">{form.specialization.length}/{LIMITS.specialization}</p>
              </div>
              <div>
                <label className="field-label" htmlFor="doctor-bio">Bio</label>
                <textarea id="doctor-bio" rows={4} maxLength={LIMITS.bio} className="field-textarea" value={form.bio} onChange={(e) => setField('bio', e.target.value)} />
                <p className="field-count">{form.bio.length}/{LIMITS.bio}</p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Button type="submit" variant="primary" loading={saving} disabled={!canSave}>{saving ? 'Saving…' : 'Save changes'}</Button>
                <Button type="button" variant="ghost" onClick={stopEditing} disabled={saving}>Cancel</Button>
                <span className="text-sm text-[var(--color-text-soft)]" role="status" aria-live="polite">{dirty ? 'You have unsaved changes.' : ''}</span>
              </div>
            </form>
          )}
        </Panel>

        <Panel title="Duty & account">
          <div className="duty-row">
              <div>
                <Badge variant={onDuty ? 'forest' : 'ink'}>{onDuty ? 'On duty' : 'Off duty'}</Badge>
                <p className="text-xs text-[var(--color-text-soft)] mt-2">
                  {onDuty ? 'Patient SOS alerts come to you.' : 'Patient SOS alerts go to the hospital administrator.'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={onDuty}
                aria-label="On duty"
                className={`duty-switch ${onDuty ? 'is-on' : ''}`}
                onClick={toggleDuty}
                disabled={dutyBusy}
              >
                <span className="duty-switch-thumb" />
              </button>
            </div>

          <div className="status-divider" />

          <dl className="account-list">
              <div><dt>Role</dt><dd>Doctor</dd></div>
              <div><dt>Member since</dt><dd>{formatMemberSince(profile.memberSince)}</dd></div>
            </dl>
        </Panel>

        <ChangePasswordCard />
      </div>
      </div>

      <ConfirmModal
        open={confirmOffDuty}
        tone="info"
        variant="primary"
        eyebrow="Duty status"
        title="Go off duty?"
        body="While you are off duty, patient SOS alerts are routed to the hospital administrator instead of you."
        confirmLabel={dutyBusy ? 'Updating…' : 'Go off duty'}
        onConfirm={() => applyDuty('off_duty')}
        onCancel={() => { if (!dutyBusy) setConfirmOffDuty(false); }}
        confirmDisabled={dutyBusy}
      />
    </DashboardShell>
  );
}
