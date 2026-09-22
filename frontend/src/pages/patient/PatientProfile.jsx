import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { patientService } from '../../api/services/patient';
import { API_BASE, apiErrorMessage, openSecureFile } from '../../api/client';
import { PatientDashboardShell } from '../../components/RoleDashboardShell';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  FormGrid,
  IconButton,
  LoadingState,
  PageHeader,
  Panel,
  StatCard,
} from '../../components/ui';
import NavIcon from '../../components/NavIcon';
import GlassLensFilter from '../../components/GlassLensFilter';
import ChangePasswordCard from '../../components/ChangePasswordCard';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../context/RealtimeContext';
import { CLINICAL_RECORD_REALTIME_EVENTS } from '../../config/realtimeEvents';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const MAX_NAME_LENGTH = 100;
const MAX_PHONE_LENGTH = 10; // bare Indian mobile number, no +91 — also the OTP-login lookup key
const MAX_ADDRESS_LENGTH = 500;
const MAX_GENDER_LENGTH = 50;
const MAX_EMERGENCY_CONTACT_LENGTH = 20;
const MAX_ALLERGIES_LENGTH = 1000;

const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;
const PROFILE_PHOTO_TYPES = ['image/jpeg', 'image/png'];
const PROFILE_PHOTO_ACCEPT = PROFILE_PHOTO_TYPES.join(',');

const STATUS_LABELS = { active: 'Active Recovery', completed: 'Completed' };

const EDITABLE_FIELDS = ['name', 'phone', 'address', 'bloodGroup', 'dateOfBirth', 'gender', 'emergencyContact', 'allergies', 'surgeryName', 'surgeryDate'];

const MAX_SURGERY_NAME_LENGTH = 150;

const RECOVERY_REALTIME_EVENTS = ['recovery_updated', 'care_episode_completed', 'clinical_record_updated'];

function formatDate(value) {
  if (!value) return 'Not recorded';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function doctorLabel(name) {
  if (!name) return 'Doctor not recorded';
  return /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;
}

function normalizeLedger(profile) {
  if (!Array.isArray(profile?.surgeryLedger)) return [];
  return profile.surgeryLedger
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const status = item.status === 'active' ? 'active' : item.status === 'completed' ? 'completed' : 'recorded';
      const procedure = item.surgeryName || item.procedure || item.name || '';
      const doctorName = item.doctorName || item.doctor?.name || '';
      const startDate = item.startDate || item.surgeryDate || item.dateOfSurgery || '';
      const dischargeDate = item.dischargeDate || item.completedAt || '';
      const duration = item.recoveryDaysTotal ?? item.expectedRecoveryDays ?? item.recoveryDays ?? null;
      const remaining = item.recoveryDaysRemaining ?? item.daysRemaining ?? null;
      return {
        ...item,
        _historyIndex: index,
        _status: status,
        _procedure: procedure,
        _doctorName: doctorName,
        _startDate: startDate,
        _dischargeDate: dischargeDate,
        _duration: Number.isFinite(Number(duration)) ? Number(duration) : null,
        _remaining: Number.isFinite(Number(remaining)) ? Number(remaining) : null,
      };
    });
}

function normalizeCurrentCare(profile) {
  return profile?.activeCareEpisode || null;
}

function normalizeDraft(profile) {
  const draft = EDITABLE_FIELDS.reduce((acc, field) => {
    acc[field] = typeof profile?.[field] === 'string' ? profile[field] : profile?.[field] ?? '';
    return acc;
  }, {});
  // The procedure name/date live on the active care episode, not as
  // top-level profile fields, so they need their own lookup.
  draft.surgeryName = profile?.activeCareEpisode?.surgeryName || '';
  draft.surgeryDate = profile?.activeCareEpisode?.startDate || '';
  return draft;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function normalizePhone(value) {
  return typeof value === 'string' ? value.trim().replace(/[\s()-]/g, '') : '';
}

function normalizeDate(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateDateOfBirth(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Enter a valid date of birth.';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date > today) return 'Date of birth cannot be in the future.';
  return '';
}

function validateSurgeryDate(value) {
  if (!value) return 'Enter the date the procedure was performed.';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Enter a valid date.';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date > today) return 'The procedure date cannot be in the future.';
  return '';
}

function validateDraft(draft, original) {
  const errors = {};
  const name = normalizeText(draft.name);
  const phone = normalizePhone(draft.phone);
  const address = typeof draft.address === 'string' ? draft.address.trim() : '';
  const bloodGroup = normalizeText(draft.bloodGroup);
  const dateOfBirth = normalizeDate(draft.dateOfBirth);
  const gender = normalizeText(draft.gender);
  const emergencyContact = normalizePhone(draft.emergencyContact);
  const allergies = typeof draft.allergies === 'string' ? draft.allergies.trim() : '';
  const hasActiveCare = Boolean(original?.activeCareEpisode);
  const surgeryName = normalizeText(draft.surgeryName);

  if (!name) errors.name = 'Full name is required.';
  else if (name.length < 2) errors.name = 'Full name must contain at least 2 characters.';
  else if (name.length > MAX_NAME_LENGTH) errors.name = `Full name must be ${MAX_NAME_LENGTH} characters or fewer.`;

  // Only enforced against a phone the user actually just typed — an existing
  // value in a non-canonical format must not block saving unrelated fields.
  if (phone && phone !== normalizePhone(original?.phone) && !/^[6-9][0-9]{9}$/.test(phone)) {
    errors.phone = 'Enter a valid 10-digit mobile number.';
  }

  if (address.length > MAX_ADDRESS_LENGTH) errors.address = `Address must be ${MAX_ADDRESS_LENGTH} characters or fewer.`;
  if (bloodGroup && !BLOOD_GROUPS.includes(bloodGroup)) errors.bloodGroup = 'Select a valid blood group.';

  const dobError = validateDateOfBirth(dateOfBirth);
  if (dobError) errors.dateOfBirth = dobError;

  if (gender.length > MAX_GENDER_LENGTH) errors.gender = `Gender must be ${MAX_GENDER_LENGTH} characters or fewer.`;

  if (emergencyContact && !/^\+?[0-9]{7,15}$/.test(emergencyContact)) {
    errors.emergencyContact = 'Enter a valid emergency contact number using 7–15 digits.';
  } else if (emergencyContact.length > MAX_EMERGENCY_CONTACT_LENGTH) {
    errors.emergencyContact = `Emergency contact must be ${MAX_EMERGENCY_CONTACT_LENGTH} characters or fewer.`;
  }

  if (allergies.length > MAX_ALLERGIES_LENGTH) errors.allergies = `Allergies must be ${MAX_ALLERGIES_LENGTH} characters or fewer.`;

  if (hasActiveCare) {
    if (!surgeryName) errors.surgeryName = 'Surgery procedure is required.';
    else if (surgeryName.length > MAX_SURGERY_NAME_LENGTH) errors.surgeryName = `Surgery procedure must be ${MAX_SURGERY_NAME_LENGTH} characters or fewer.`;

    const surgeryDateError = validateSurgeryDate(normalizeDate(draft.surgeryDate));
    if (surgeryDateError) errors.surgeryDate = surgeryDateError;
  }

  return errors;
}

function buildPayload(draft, hasActiveCare) {
  const payload = {
    name: normalizeText(draft.name),
    phone: normalizePhone(draft.phone),
    address: typeof draft.address === 'string' ? draft.address.trim() : '',
    bloodGroup: normalizeText(draft.bloodGroup),
    dateOfBirth: normalizeDate(draft.dateOfBirth),
    gender: normalizeText(draft.gender),
    emergencyContact: normalizePhone(draft.emergencyContact),
    allergies: typeof draft.allergies === 'string' ? draft.allergies.trim() : '',
  };

  // Only sent when there's an active episode to apply it to — the
  // backend's wire name is `startDate` (it updates both the Surgery
  // row and the linked CareEpisode's startDate together, since the
  // recovery-day countdown is computed from the latter).
  if (hasActiveCare) {
    payload.surgeryName = normalizeText(draft.surgeryName);
    payload.startDate = normalizeDate(draft.surgeryDate);
  }

  return payload;
}

export default function PatientProfile() {
  const { updateUserLocal } = useAuth();
  const { subscribe } = useRealtime();

  const [profile, setProfile] = useState(null);
  const [draft, setDraft] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [expandedSurgeryId, setExpandedSurgeryId] = useState(null);

  const [filesToken, setFilesToken] = useState('');
  const [allFiles, setAllFiles] = useState([]);
  const [filesPassword, setFilesPassword] = useState('');
  const [filesError, setFilesError] = useState('');
  const [filesUnlocking, setFilesUnlocking] = useState(false);

  const fileRef = useRef(null);

  async function load() {
    setLoadError('');
    try {
      const res = await patientService.getProfile();
      const nextProfile = res.data;
      setProfile(nextProfile);
      setDraft(normalizeDraft(nextProfile));
      setFieldErrors({});
      setSaveError('');
    } catch (err) {
      setLoadError(err?.message || 'We could not load your profile right now.');
    }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const cleanups = RECOVERY_REALTIME_EVENTS.map((eventName) =>
      subscribe(eventName, (payload) => {
        const patientId = payload?.patientId || payload?.patient?.id || payload?.userId;
        const currentPatientId = profile?.id || profile?.userId;
        if (!patientId || !currentPatientId || patientId === currentPatientId) void load();
      }),
    );
    return () => cleanups.forEach((cleanup) => cleanup?.());
  }, [subscribe, profile?.id, profile?.userId]);

  // Closing or reloading the tab with unsaved edits asks first.
  const hasActiveCare = Boolean(profile?.activeCareEpisode);
  const dirty = useMemo(
    () => profile ? JSON.stringify(buildPayload(draft, hasActiveCare)) !== JSON.stringify(buildPayload(normalizeDraft(profile), hasActiveCare)) : false,
    [draft, profile, hasActiveCare],
  );
  useEffect(() => {
    if (!editing || !dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [editing, dirty]);

  useEffect(() => () => { if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.url); }, [pendingPhoto]);

  function startEditing() {
    setSaveError('');
    setEditing(true);
  }

  function stopEditing() {
    setDraft(normalizeDraft(profile));
    setFieldErrors({});
    setPendingPhoto(null);
    setSaveError('');
    setEditing(false);
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: '' }));
    setSaveError('');
  }

  function validateAndSave(event) {
    event.preventDefault();
    if (!profile || saving) return;

    const errors = validateDraft(draft, profile);
    setFieldErrors(errors);
    setSaveError('');

    if (Object.keys(errors).length > 0) {
      const firstInvalidField = EDITABLE_FIELDS.find((field) => errors[field]);
      if (firstInvalidField) {
        window.setTimeout(() => document.getElementById(`patient-profile-${firstInvalidField}`)?.focus(), 0);
      }
      return;
    }

    void persistProfile(buildPayload(draft, hasActiveCare));
  }

  async function persistProfile(payload) {
    setSaving(true);
    try {
      // PUT /patient/profile only returns a confirmation message, never the
      // updated profile, so the new state is always built locally from what
      // was just sent — surgeryName/startDate need special handling since
      // they live nested under activeCareEpisode, not as top-level fields.
      await patientService.updateProfile(payload);
      const nextProfile = { ...profile, ...payload };
      delete nextProfile.surgeryName;
      delete nextProfile.startDate;
      if (profile?.activeCareEpisode && (payload.surgeryName !== undefined || payload.startDate !== undefined)) {
        nextProfile.activeCareEpisode = {
          ...profile.activeCareEpisode,
          ...(payload.surgeryName !== undefined && { surgeryName: payload.surgeryName }),
          ...(payload.startDate !== undefined && { startDate: payload.startDate }),
        };
        // The same surgery also appears as its own row in the surgical
        // history ledger below — keep that in sync too, matched by
        // Surgery id (not care-episode id, a different id space).
        const surgeryId = profile.activeCareEpisode.surgeryId;
        if (surgeryId && Array.isArray(profile.surgeryLedger)) {
          nextProfile.surgeryLedger = profile.surgeryLedger.map((item) =>
            item.id === surgeryId
              ? {
                  ...item,
                  ...(payload.surgeryName !== undefined && { surgeryName: payload.surgeryName }),
                  ...(payload.startDate !== undefined && { startDate: payload.startDate }),
                }
              : item,
          );
        }
      }
      setProfile(nextProfile);
      setDraft(normalizeDraft(nextProfile));
      setFieldErrors({});
      updateUserLocal({ name: nextProfile.name || payload.name });
      setEditing(false);
    } catch (err) {
      setSaveError(err?.message || 'We could not save your profile changes. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function validatePhoto(file) {
    if (!PROFILE_PHOTO_TYPES.includes(file.type)) return 'Choose a JPG or PNG image.';
    if (file.size > MAX_PROFILE_PHOTO_BYTES) return 'Profile photos must be 5 MB or smaller.';
    if (file.size === 0) return 'The selected image is empty. Choose another photo.';
    return '';
  }

  function choosePhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPhotoError('');
    const validationError = validatePhoto(file);
    if (validationError) {
      setPhotoError(validationError);
      return;
    }
    setPendingPhoto((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return { file, url: URL.createObjectURL(file) };
    });
  }

  async function uploadPhoto() {
    if (!pendingPhoto || uploadingPhoto) return;
    setUploadingPhoto(true);
    setPhotoError('');
    try {
      const formData = new FormData();
      formData.append('photo', pendingPhoto.file);
      const res = await patientService.uploadProfilePhoto(formData);
      const nextPhotoUrl = res?.data?.photoUrl;
      if (!nextPhotoUrl) throw new Error('The server did not return a profile photo URL.');
      setProfile((current) => ({ ...current, photoUrl: nextPhotoUrl }));
      updateUserLocal({ photoUrl: nextPhotoUrl });
      setPendingPhoto(null);
    } catch (err) {
      setPhotoError(err?.message || 'We could not update your profile photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function removePhoto() {
    if (uploadingPhoto) return;
    setUploadingPhoto(true);
    setPhotoError('');
    try {
      await patientService.removeProfilePhoto();
      setProfile((current) => ({ ...current, photoUrl: null }));
      updateUserLocal({ photoUrl: null });
    } catch (err) {
      setPhotoError(err?.message || 'We could not remove your profile photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function unlockFiles(event) {
    event.preventDefault();
    setFilesError('');
    if (!filesPassword.trim()) {
      setFilesError('Enter your account password to continue.');
      return;
    }
    setFilesUnlocking(true);
    try {
      const verifyRes = await patientService.verifyLabReports(filesPassword);
      const token = verifyRes?.data?.stepUpToken;
      if (!token) throw new Error('Verification did not return an access token.');
      const filesRes = await patientService.getLabReports(token);
      setFilesToken(token);
      setAllFiles(Array.isArray(filesRes?.data?.files) ? filesRes.data.files : []);
      setFilesPassword('');
    } catch (err) {
      const status = err?.response?.status;
      setFilesError(
        status === 401 || status === 403
          ? 'The account password could not be verified.'
          : err?.response?.data?.error || err?.message || 'We could not verify your password. Please try again.',
      );
    } finally {
      setFilesUnlocking(false);
    }
  }

  const refreshFiles = useCallback(async (token) => {
    if (!token) return;
    try {
      const filesRes = await patientService.getLabReports(token);
      setAllFiles(Array.isArray(filesRes?.data?.files) ? filesRes.data.files : []);
    } catch {
      // Silent background refresh; a manual unlock retry surfaces real errors.
    }
  }, []);

  // A doctor uploading a new file pushes this event; pull the latest list
  // silently while unlocked instead of waiting for the patient to reload.
  useEffect(() => {
    if (!filesToken) return undefined;
    const cleanups = CLINICAL_RECORD_REALTIME_EVENTS.map((eventName) =>
      subscribe(eventName, () => refreshFiles(filesToken)),
    );
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [subscribe, filesToken, refreshFiles]);

  async function openFile(fileUrl, label) {
    setFilesError('');
    try {
      await openSecureFile(fileUrl, filesToken ? { 'X-Step-Up-Token': filesToken } : {});
    } catch (err) {
      setFilesError(apiErrorMessage(err) || `Unable to open ${label || 'this file'}.`);
    }
  }

  const ledger = useMemo(() => normalizeLedger(profile), [profile]);
  const currentCare = useMemo(() => normalizeCurrentCare(profile), [profile]);
  const completedSurgeries = ledger.filter((item) => item._status === 'completed').length;
  const activeSurgeries = ledger.filter((item) => item._status === 'active').length;

  const sortedLedger = useMemo(
    () => [...ledger].sort((a, b) => {
      const aTime = a?._startDate ? new Date(`${a._startDate}T00:00:00`).getTime() : 0;
      const bTime = b?._startDate ? new Date(`${b._startDate}T00:00:00`).getTime() : 0;
      if (Number.isNaN(aTime) && Number.isNaN(bTime)) return a._historyIndex - b._historyIndex;
      if (Number.isNaN(aTime)) return 1;
      if (Number.isNaN(bTime)) return -1;
      return bTime - aTime || a._historyIndex - b._historyIndex;
    }),
    [ledger],
  );

  if (!profile && !loadError) {
    return (
      <PatientDashboardShell>
        <div className="patient-profile-page">
        <GlassLensFilter />
        <PageHeader title="Your Profile" subtitle="Loading your personal details and surgical history." />
        <Panel><LoadingState label="Loading your profile…" rows={4} /></Panel>
        </div>
      </PatientDashboardShell>
    );
  }

  if (!profile && loadError) {
    return (
      <PatientDashboardShell>
        <div className="patient-profile-page">
        <GlassLensFilter />
        <PageHeader title="Your Profile" subtitle="We could not retrieve your profile information right now." />
        <Panel>
          <EmptyState
            title="Profile temporarily unavailable"
            subtitle={loadError}
            action={<Button variant="primary" onClick={load}>Retry profile</Button>}
          />
        </Panel>
        </div>
      </PatientDashboardShell>
    );
  }

  const shownPhoto = pendingPhoto ? pendingPhoto.url : profile.photoUrl ? `${API_BASE}${profile.photoUrl}` : '';

  return (
    <PatientDashboardShell>
      <div className="patient-profile-page">
      <GlassLensFilter />
      <PageHeader title="Your Profile" subtitle="Your personal details and surgical history." />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Surgical episodes" value={ledger.length} detail="Permanent history on file" accent="crimson" />
        <StatCard label="Completed episodes" value={completedSurgeries} detail="Retained for future care" accent="forest" />
        <StatCard
          label="Current care"
          value={activeSurgeries ? 'Active' : 'None'}
          detail={activeSurgeries ? 'Current recovery episode' : 'No active recovery episode'}
          accent={activeSurgeries ? 'gold' : 'ink'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch mb-6">
        <Panel className="profile-identity flex flex-col items-center justify-center text-center">
          {shownPhoto ? (
            <img src={shownPhoto} alt="" className="w-40 h-40 rounded-full object-cover mb-4" />
          ) : (
            <div className="w-40 h-40 rounded-full bg-[var(--color-crimson)] flex items-center justify-center text-white text-6xl font-semibold mb-4" aria-hidden="true">
              {profile.name?.[0]?.toUpperCase() || 'P'}
            </div>
          )}

          <p className="doctor-name-under text-4xl">{profile.name}</p>

          <input ref={fileRef} type="file" accept={PROFILE_PHOTO_ACCEPT} hidden onChange={choosePhoto} />

          {editing ? (
            pendingPhoto ? (
              <div className="flex gap-2 flex-wrap justify-center">
                <Button variant="primary" onClick={uploadPhoto} loading={uploadingPhoto}>Save photo</Button>
                <Button variant="outline" onClick={() => setPendingPhoto(null)} disabled={uploadingPhoto}>Cancel</Button>
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap justify-center">
                <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploadingPhoto}>
                  {profile.photoUrl ? 'Change photo' : 'Add photo'}
                </Button>
                {profile.photoUrl ? <Button variant="ghost" onClick={removePhoto} loading={uploadingPhoto}>Remove</Button> : null}
              </div>
            )
          ) : null}

          {photoError ? (
            <Alert className="mt-3 w-full" variant="danger" title="Photo update failed">{photoError}</Alert>
          ) : null}
        </Panel>

        <Panel
          title="Personal Details"
          action={!editing ? <IconButton label="Edit profile" className="edit-btn" onClick={startEditing}><NavIcon name="edit" size={18} /></IconButton> : null}
        >
          {!editing ? (
            <dl className="detail-list">
              <div><dt>Full name</dt><dd>{profile.name}</dd></div>
              <div><dt>Phone</dt><dd>{profile.phone ? `+91 ${profile.phone}` : <span className="not-set">Not added</span>}</dd></div>
              <div><dt>Email</dt><dd className="break-words">{profile.email}</dd></div>
              <div><dt>Blood group</dt><dd>{profile.bloodGroup || <span className="not-set">Not added</span>}</dd></div>
              <div><dt>Date of birth</dt><dd>{profile.dateOfBirth ? formatDate(profile.dateOfBirth) : <span className="not-set">Not added</span>}</dd></div>
              <div><dt>Gender</dt><dd>{profile.gender || <span className="not-set">Not added</span>}</dd></div>
              <div><dt>Emergency contact</dt><dd>{profile.emergencyContact || <span className="not-set">Not added</span>}</dd></div>
              <div className="detail-wide"><dt>Address</dt><dd className="whitespace-pre-wrap break-words">{profile.address || <span className="not-set">Not added</span>}</dd></div>
              <div className="detail-wide"><dt>Allergies</dt><dd className="whitespace-pre-wrap break-words">{profile.allergies || <span className="not-set">Not added</span>}</dd></div>
            </dl>
          ) : (
            <form onSubmit={validateAndSave} noValidate className="space-y-5">
              <FormGrid columns={2}>
                <ValidatedField
                  id="patient-profile-name" label="Full name" required
                  value={draft.name || ''} error={fieldErrors.name}
                  onChange={(value) => updateDraft('name', value)}
                  autoComplete="name" maxLength={MAX_NAME_LENGTH}
                />
                <ValidatedField
                  id="patient-profile-phone" label="Phone"
                  value={draft.phone || ''} error={fieldErrors.phone}
                  onChange={(value) => updateDraft('phone', value.replace(/\D/g, '').slice(0, MAX_PHONE_LENGTH))}
                  type="tel" autoComplete="tel-national" maxLength={MAX_PHONE_LENGTH} inputMode="numeric" prefix="+91"
                />
              </FormGrid>

              <Field label="Email" hint="Your login email cannot be changed from the patient profile.">
                <input className="field-input bg-[var(--color-parchment-deep)]" value={profile.email || ''} disabled aria-readonly="true" aria-label="Login email" />
              </Field>

              <ValidatedField
                id="patient-profile-address" label="Address"
                value={draft.address || ''} error={fieldErrors.address}
                onChange={(value) => updateDraft('address', value)}
                multiline rows={2} maxLength={MAX_ADDRESS_LENGTH} autoComplete="street-address"
              />

              <FormGrid columns={3}>
                <Field label="Blood group" hint={fieldErrors.bloodGroup || undefined}>
                  <select
                    id="patient-profile-bloodGroup" aria-label="Blood group"
                    className={`field-select${fieldErrors.bloodGroup ? ' border-[var(--color-danger)]' : ''}`}
                    value={draft.bloodGroup || ''}
                    onChange={(event) => updateDraft('bloodGroup', event.target.value)}
                    aria-invalid={Boolean(fieldErrors.bloodGroup)}
                  >
                    <option value="">Select</option>
                    {BLOOD_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
                  </select>
                  {fieldErrors.bloodGroup ? <p className="field-error" role="alert">{fieldErrors.bloodGroup}</p> : null}
                </Field>

                <ValidatedField
                  id="patient-profile-dateOfBirth" label="Date of birth"
                  value={draft.dateOfBirth || ''} error={fieldErrors.dateOfBirth}
                  onChange={(value) => updateDraft('dateOfBirth', value)}
                  type="date" autoComplete="bday"
                />

                <ValidatedField
                  id="patient-profile-gender" label="Gender"
                  value={draft.gender || ''} error={fieldErrors.gender}
                  onChange={(value) => updateDraft('gender', value)}
                  maxLength={MAX_GENDER_LENGTH}
                />
              </FormGrid>

              <FormGrid columns={2}>
                <ValidatedField
                  id="patient-profile-emergencyContact" label="Emergency contact"
                  value={draft.emergencyContact || ''} error={fieldErrors.emergencyContact}
                  onChange={(value) => updateDraft('emergencyContact', value)}
                  type="tel" autoComplete="tel" maxLength={MAX_EMERGENCY_CONTACT_LENGTH} inputMode="tel"
                />

                <ValidatedField
                  id="patient-profile-allergies" label="Allergies" hint="Keep this accurate so clinicians can review it when treating you."
                  value={draft.allergies || ''} error={fieldErrors.allergies}
                  onChange={(value) => updateDraft('allergies', value)}
                  multiline rows={2} maxLength={MAX_ALLERGIES_LENGTH}
                />
              </FormGrid>

              {hasActiveCare ? (
                <FormGrid columns={2}>
                  <ValidatedField
                    id="patient-profile-surgeryName" label="Surgery done" required
                    value={draft.surgeryName || ''} error={fieldErrors.surgeryName}
                    onChange={(value) => updateDraft('surgeryName', value)}
                    maxLength={MAX_SURGERY_NAME_LENGTH}
                  />

                  <ValidatedField
                    id="patient-profile-surgeryDate" label="Date performed" required
                    value={draft.surgeryDate || ''} error={fieldErrors.surgeryDate}
                    onChange={(value) => updateDraft('surgeryDate', value)}
                    type="date"
                  />
                </FormGrid>
              ) : null}

              {saveError ? <Alert variant="danger" title="Profile could not be saved" role="alert">{saveError}</Alert> : null}

              <div className="flex items-center gap-3 flex-wrap">
                <Button type="submit" variant="primary" loading={saving} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save changes'}</Button>
                <Button type="button" variant="ghost" onClick={stopEditing} disabled={saving}>Cancel</Button>
                <span className="text-sm text-[var(--color-text-soft)]" role="status" aria-live="polite">{dirty ? 'You have unsaved changes.' : ''}</span>
              </div>
            </form>
          )}
        </Panel>
      </div>

      <div className="mb-6">
        <ChangePasswordCard />
      </div>

      {currentCare ? (
        <Panel
          className="mb-6"
          title="Current Recovery Episode"
          action={<Badge variant="forest">{STATUS_LABELS[currentCare.status] || currentCare.status || 'Active'}</Badge>}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ProfileFact label="Surgery procedure" value={currentCare.surgeryName || 'Not recorded'} />
            <ProfileFact label="Surgeon name" value={doctorLabel(currentCare.doctorName)} />
            <ProfileFact label="Specialization" value={currentCare.specialization || 'Not recorded'} />
            <ProfileFact label="Date" value={formatDate(currentCare.startDate)} />
          </div>
        </Panel>
      ) : null}

      <Panel title="Surgical History" action={<Badge variant="muted">{ledger.length} record{ledger.length === 1 ? '' : 's'}</Badge>}>
        {sortedLedger.length === 0 ? (
          <EmptyState title="No surgical history on file yet" subtitle="Completed and active surgical episodes will appear here as they are recorded." />
        ) : (
          <div className="patient-surgery-timeline" aria-label="Surgical history timeline">
            {sortedLedger.map((surgery, index) => {
              const surgeryKey = surgery.id || surgery.careEpisodeId || surgery.episodeId || `history-${surgery._historyIndex}`;
              const expanded = expandedSurgeryId === surgeryKey;
              const episodeFiles = allFiles.filter((file) => file.surgeryId === surgery.id);

              return (
                <article
                  key={surgeryKey}
                  className={`patient-surgery-timeline-item${expanded ? ' is-expanded' : ''}`}
                  aria-label={`${surgery._procedure || 'Surgical episode'}, ${STATUS_LABELS[surgery._status] || 'Recorded'}`}
                >
                  <div className="patient-surgery-timeline-marker" aria-hidden="true">{index + 1}</div>

                  <div className="patient-surgery-timeline-card rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]">
                    <button
                      type="button"
                      className="patient-surgery-timeline-toggle w-full p-4 text-left sm:p-5"
                      aria-expanded={expanded}
                      aria-controls={`surgery-episode-${index}`}
                      onClick={() => setExpandedSurgeryId(expanded ? null : surgeryKey)}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <h2 className="break-words font-semibold text-[var(--color-ink)]">{surgery._procedure || 'Procedure not recorded'}</h2>
                            <Badge variant={surgery._status === 'active' ? 'forest' : 'muted'}>{STATUS_LABELS[surgery._status] || 'Recorded'}</Badge>
                            {currentCare && (surgery.careEpisodeId || surgery.episodeId) === (currentCare.careEpisodeId || currentCare.id) ? (
                              <Badge variant="gold">Current recovery</Badge>
                            ) : null}
                          </div>
                          <p className="break-words text-sm text-[var(--color-text-soft)]">
                            Started {formatDate(surgery._startDate)}
                            {surgery._dischargeDate ? ` · Discharged ${formatDate(surgery._dischargeDate)}` : ''}
                          </p>
                        </div>

                        <span className="shrink-0 text-xs font-semibold text-[var(--color-crimson)] sm:text-right">
                          {expanded ? 'Hide episode details' : 'View episode details'}
                        </span>
                      </div>
                    </button>

                    {expanded ? (
                      <div id={`surgery-episode-${index}`} className="border-t border-[var(--color-line)] px-4 pb-5 pt-4 sm:px-5">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <ProfileFact label="Procedure" value={surgery._procedure || 'Not recorded'} />
                          <ProfileFact label="Doctor" value={surgery._doctorName ? doctorLabel(surgery._doctorName) : 'Doctor not recorded'} />
                          <ProfileFact label="Started" value={formatDate(surgery._startDate)} />
                          <ProfileFact label="Discharged" value={formatDate(surgery._dischargeDate)} />
                        </div>

                        <div className="mt-4 border-t border-[var(--color-line)] pt-4">
                          <p className="field-label mb-2">Files</p>
                          {filesToken ? (
                            episodeFiles.length === 0 ? (
                              <p className="text-sm text-[var(--color-text-soft)]">No files attached to this episode.</p>
                            ) : (
                              <div className="space-y-2">
                                {episodeFiles.map((file) => (
                                  <div key={file.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-line)] p-2.5">
                                    <span className="text-sm font-medium text-[var(--color-ink)] truncate">{file.label}</span>
                                    <Button type="button" variant="outline" size="sm" onClick={() => openFile(file.fileUrl, file.label)}>Open ↗</Button>
                                  </div>
                                ))}
                              </div>
                            )
                          ) : (
                            <form onSubmit={unlockFiles} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                              <Field label="Account password" hint="Verify your password once to view files for this session.">
                                <input
                                  type="password" className="field-input" autoComplete="current-password"
                                  value={filesPassword} onChange={(event) => setFilesPassword(event.target.value)}
                                />
                              </Field>
                              <Button type="submit" variant="outline" loading={filesUnlocking}>Unlock files</Button>
                            </form>
                          )}
                          {filesError ? <p className="field-error mt-2" role="alert">{filesError}</p> : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>
      </div>
    </PatientDashboardShell>
  );
}

function ValidatedField({ id, label, required = false, value, error, hint, onChange, type = 'text', multiline = false, rows = 2, maxLength, autoComplete, inputMode, prefix }) {
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;

  return (
    <div className="form-control-group">
      <label className="field-label" htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>

      {hint && !error ? <span id={`${id}-hint`} className="sr-only">{hint}</span> : null}

      {multiline ? (
        <textarea
          id={id} rows={rows}
          className={`field-textarea${error ? ' border-[var(--color-danger)]' : ''}`}
          value={value} onChange={(event) => onChange(event.target.value)}
          maxLength={maxLength} autoComplete={autoComplete}
          aria-invalid={Boolean(error)} aria-describedby={describedBy}
        />
      ) : (
        <div className={prefix ? 'phone-input' : undefined}>
          {prefix ? <span className="phone-input-prefix">{prefix}</span> : null}
          <input
            id={id} type={type}
            className={`field-input${error ? ' border-[var(--color-danger)]' : ''}`}
            value={value} onChange={(event) => onChange(event.target.value)}
            maxLength={maxLength} autoComplete={autoComplete} inputMode={inputMode}
            aria-invalid={Boolean(error)} aria-describedby={describedBy}
          />
        </div>
      )}

      {error ? <p id={`${id}-error`} className="field-error" role="alert">{error}</p> : null}
      {hint && !error ? <p className="form-help">{hint}</p> : null}
    </div>
  );
}

function ProfileFact({ label, value }) {
  return (
    <div className="min-w-0 rounded-md bg-[var(--color-parchment)] p-3">
      <p className="text-xs uppercase tracking-[0.08em] text-[var(--color-text-soft)]">{label}</p>
      <div className="mt-1 break-words font-medium text-[var(--color-ink)]">{value}</div>
    </div>
  );
}
