import { doctorService } from '../../api/services/doctor';
import { API_BASE } from '../../api/client';
import { useCallback, useEffect, useState, useRef } from 'react';
import { DoctorDashboardShell as DashboardShell } from '../../components/RoleDashboardShell';
import { Panel, Button, Badge, Alert } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../context/RealtimeContext';
import { REALTIME_EVENTS } from '../../config/realtimeEvents';

export default function DoctorProfile() {
  const { updateUserLocal } = useAuth();
  const { publish } = useRealtime();
  const [profile, setProfile] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dutyBusy, setDutyBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef();

  const load = useCallback(async () => {
    try {
      const res = await doctorService.getProfile();
      setProfile(res.data);
      setError('');
    } catch (err) {
      setError(err?.message || 'Unable to load your profile.');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function handleSave(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await doctorService.updateProfile({
        name: profile.name, phone: profile.phone, specialization: profile.specialization, bio: profile.bio,
      });
      updateUserLocal({ name: profile.name });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err?.message || 'Profile could not be updated.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleDuty() {
    if (dutyBusy) return;
    setDutyBusy(true);
    setError('');
    const next = profile.dutyStatus === 'on_duty' ? 'off_duty' : 'on_duty';
    try {
      await doctorService.setDutyStatus(next);
      setProfile({ ...profile, dutyStatus: next });
      publish(REALTIME_EVENTS.DOCTOR_DUTY_UPDATED, { doctorId: profile.id, dutyStatus: next });
    } catch (err) {
      setError(err?.message || 'Duty status could not be updated.');
    } finally {
      setDutyBusy(false);
    }
  }

  async function handlePhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Profile photo must be JPG or PNG and no larger than 5 MB.');
      e.target.value = '';
      return;
    }
    setPhotoBusy(true);
    setError('');
    const fd = new FormData();
    fd.append('photo', file);
    try {
      const res = await doctorService.uploadProfilePhoto(fd);
      setProfile({ ...profile, photoUrl: res.data.photoUrl });
      updateUserLocal({ photoUrl: res.data.photoUrl });
    } catch (err) {
      setError(err?.message || 'Profile photo could not be uploaded.');
    } finally {
      setPhotoBusy(false);
      e.target.value = '';
    }
  }

  if (!profile) return (
    <DashboardShell>
      {error ? <Panel><Alert variant="danger" title="Profile unavailable">{error}</Alert><div className="mt-4"><Button onClick={load}>Retry</Button></div></Panel> : <Panel><p className="text-sm text-[var(--color-text-soft)]">Loading your profile…</p></Panel>}
    </DashboardShell>
  );

  return (
    <DashboardShell>
      <h1 className="font-display text-3xl text-[var(--color-ink)] mb-6">Your Profile</h1>

      <div className="grid grid-cols-3 gap-6">
        <Panel className="col-span-1 flex flex-col items-center text-center">
          {profile.photoUrl ? (
            <img src={`${API_BASE}${profile.photoUrl}`} alt="" className="w-24 h-24 rounded-full object-cover mb-3" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-[var(--color-crimson)] flex items-center justify-center text-white text-3xl font-semibold mb-3">
              {profile.name?.[0]}
            </div>
          )}
          <input type="file" accept="image/jpeg,image/png" hidden ref={fileRef} onChange={handlePhoto} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={photoBusy}>{photoBusy ? 'Uploading…' : 'Change Photo'}</Button>

          <div className="w-full border-t border-[var(--color-line)] mt-5 pt-5">
            <p className="field-label">Unique Doctor ID</p>
            <Badge variant="gold">{profile.uniqueDoctorId}</Badge>
            <p className="text-xs text-[var(--color-text-soft)] mt-2">Give this to a patient after their surgery so they can sign up under your care.</p>
          </div>

          <div className="w-full border-t border-[var(--color-line)] mt-5 pt-5">
            <p className="field-label mb-2">Duty Status</p>
            <Button variant={profile.dutyStatus === 'on_duty' ? 'primary' : 'danger'} className="w-full" onClick={toggleDuty} disabled={dutyBusy}>
              {dutyBusy ? 'Updating…' : profile.dutyStatus === 'on_duty' ? 'Currently On Duty' : 'Currently Off Duty'} — Toggle duty status
            </Button>
            {profile.dutyStatus === 'off_duty' && (
              <p className="text-xs text-[var(--color-danger)] mt-2">
                While off duty, patient SOS alerts are routed directly to the hospital administrator.
              </p>
            )}
          </div>
        </Panel>

        <Panel title="Details" className="col-span-2">
          {error && !saved ? <div className="mb-4" role="alert"><Alert variant="danger" title="Profile update issue">{error}</Alert></div> : null}
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="field-label">Full name</label>
                <input id="doctor-name" aria-label="Full name" className="field-input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
              </div>
              <div>
                <label className="field-label">Phone</label>
                <input id="doctor-phone" aria-label="Phone" className="field-input" value={profile.phone || ''} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="field-label">Email</label>
              <input className="field-input bg-[var(--color-parchment-deep)]" value={profile.email} disabled />
            </div>
            <div>
              <label className="field-label">Specialization</label>
              <input id="doctor-specialization" aria-label="Specialization" className="field-input" value={profile.specialization || ''} onChange={(e) => setProfile({ ...profile, specialization: e.target.value })} />
            </div>
            <div>
              <label className="field-label">Bio</label>
              <textarea id="doctor-bio" aria-label="Bio" rows={4} className="field-textarea" value={profile.bio || ''} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} />
            </div>
            {saved && <Alert variant="success">Profile updated.</Alert>}
            <Button type="submit" variant="primary" loading={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
          </form>
        </Panel>
      </div>
    </DashboardShell>
  );
}
