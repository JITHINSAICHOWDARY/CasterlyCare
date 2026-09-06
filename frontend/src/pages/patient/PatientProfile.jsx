import { useEffect, useMemo, useRef, useState } from 'react';

import { patientService } from '../../api/services/patient';
import { API_BASE } from '../../api/client';
import PatientDashboardShell from '../../components/PatientDashboardShell';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  FormGrid,
  LoadingState,
  PageHeader,
  Panel,
  SectionHeading,
  StatCard,
} from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../context/RealtimeContext';

// PHASE_2_5_2: Patient personal details editing and validation.
// PHASE_2_5_4: Permanent surgery history timeline and episode details.
// PHASE_2_5_7: Final accessibility, keyboard, responsive, and acceptance hardening.
// PHASE_2_13: Realtime recovery/profile refresh integration.

const BLOOD_GROUPS = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
];

const MAX_NAME_LENGTH = 100;
const MAX_PHONE_LENGTH = 20;
const MAX_ADDRESS_LENGTH = 500;
const MAX_GENDER_LENGTH = 50;
const MAX_EMERGENCY_CONTACT_LENGTH = 20;
const MAX_ALLERGIES_LENGTH = 1000;

const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;

const PROFILE_PHOTO_TYPES = [
  'image/jpeg',
  'image/png',
];

const PROFILE_PHOTO_ACCEPT = PROFILE_PHOTO_TYPES.join(',');

const STATUS_LABELS = {
  active: 'Active Recovery',
  completed: 'Completed',
};

const EDITABLE_FIELDS = [
  'name',
  'phone',
  'address',
  'bloodGroup',
  'dateOfBirth',
  'gender',
  'emergencyContact',
  'allergies',
];

const RECOVERY_REALTIME_EVENTS = [
  'recovery_updated',
  'care_episode_completed',
  'clinical_record_updated',
];

function formatDate(value) {
  if (!value) return 'Not recorded';

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function doctorLabel(name) {
  if (!name) return 'Doctor not recorded';

  return /^dr\.?\s/i.test(name)
    ? name
    : `Dr. ${name}`;
}

function normalizeLedger(profile) {
  if (!Array.isArray(profile?.surgeryLedger)) {
    return [];
  }

  return profile.surgeryLedger
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const status =
        item.status === 'active'
          ? 'active'
          : item.status === 'completed'
            ? 'completed'
            : 'recorded';

      const procedure =
        item.surgeryName ||
        item.procedure ||
        item.name ||
        '';

      const doctorName =
        item.doctorName ||
        item.doctor?.name ||
        '';

      const startDate =
        item.startDate ||
        item.surgeryDate ||
        item.dateOfSurgery ||
        '';

      const dischargeDate =
        item.dischargeDate ||
        item.completedAt ||
        '';

      const duration =
        item.recoveryDaysTotal ??
        item.expectedRecoveryDays ??
        item.recoveryDays ??
        null;

      const remaining =
        item.recoveryDaysRemaining ??
        item.daysRemaining ??
        null;

      return {
        ...item,
        _historyIndex: index,
        _status: status,
        _procedure: procedure,
        _doctorName: doctorName,
        _startDate: startDate,
        _dischargeDate: dischargeDate,
        _duration: Number.isFinite(Number(duration))
          ? Number(duration)
          : null,
        _remaining: Number.isFinite(Number(remaining))
          ? Number(remaining)
          : null,
      };
    });
}

function normalizeCurrentCare(profile) {
  return profile?.activeCareEpisode || null;
}

function normalizeDraft(profile) {
  return EDITABLE_FIELDS.reduce((draft, field) => {
    draft[field] =
      typeof profile?.[field] === 'string'
        ? profile[field]
        : profile?.[field] ?? '';

    return draft;
  }, {});
}

function normalizeText(value) {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ')
    : '';
}

function normalizePhone(value) {
  return typeof value === 'string'
    ? value.trim().replace(/[\s()-]/g, '')
    : '';
}

function normalizeDate(value) {
  return typeof value === 'string'
    ? value.trim()
    : '';
}

function validateDateOfBirth(value) {
  if (!value) return '';

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return 'Enter a valid date of birth.';
  }

  const today = new Date();

  today.setHours(0, 0, 0, 0);

  if (date > today) {
    return 'Date of birth cannot be in the future.';
  }

  return '';
}

function validateDraft(draft) {
  const errors = {};

  const name = normalizeText(draft.name);
  const phone = normalizePhone(draft.phone);

  const address =
    typeof draft.address === 'string'
      ? draft.address.trim()
      : '';

  const bloodGroup = normalizeText(draft.bloodGroup);
  const dateOfBirth = normalizeDate(draft.dateOfBirth);
  const gender = normalizeText(draft.gender);
  const emergencyContact = normalizePhone(draft.emergencyContact);

  const allergies =
    typeof draft.allergies === 'string'
      ? draft.allergies.trim()
      : '';

  if (!name) {
    errors.name = 'Full name is required.';
  } else if (name.length < 2) {
    errors.name = 'Full name must contain at least 2 characters.';
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name =
      `Full name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }

  if (
    phone &&
    !/^\+?[0-9]{7,15}$/.test(phone)
  ) {
    errors.phone =
      'Enter a valid phone number using 7–15 digits.';
  } else if (phone.length > MAX_PHONE_LENGTH) {
    errors.phone =
      `Phone number must be ${MAX_PHONE_LENGTH} characters or fewer.`;
  }

  if (address.length > MAX_ADDRESS_LENGTH) {
    errors.address =
      `Address must be ${MAX_ADDRESS_LENGTH} characters or fewer.`;
  }

  if (
    bloodGroup &&
    !BLOOD_GROUPS.includes(bloodGroup)
  ) {
    errors.bloodGroup =
      'Select a valid blood group.';
  }

  const dobError = validateDateOfBirth(dateOfBirth);

  if (dobError) {
    errors.dateOfBirth = dobError;
  }

  if (gender.length > MAX_GENDER_LENGTH) {
    errors.gender =
      `Gender must be ${MAX_GENDER_LENGTH} characters or fewer.`;
  }

  if (
    emergencyContact &&
    !/^\+?[0-9]{7,15}$/.test(emergencyContact)
  ) {
    errors.emergencyContact =
      'Enter a valid emergency contact number using 7–15 digits.';
  } else if (
    emergencyContact.length > MAX_EMERGENCY_CONTACT_LENGTH
  ) {
    errors.emergencyContact =
      `Emergency contact must be ${MAX_EMERGENCY_CONTACT_LENGTH} characters or fewer.`;
  }

  if (allergies.length > MAX_ALLERGIES_LENGTH) {
    errors.allergies =
      `Allergies must be ${MAX_ALLERGIES_LENGTH} characters or fewer.`;
  }

  return errors;
}

function buildPayload(draft) {
  return {
    name: normalizeText(draft.name),
    phone: normalizePhone(draft.phone),
    address:
      typeof draft.address === 'string'
        ? draft.address.trim()
        : '',
    bloodGroup: normalizeText(draft.bloodGroup),
    dateOfBirth: normalizeDate(draft.dateOfBirth),
    gender: normalizeText(draft.gender),
    emergencyContact: normalizePhone(
      draft.emergencyContact,
    ),
    allergies:
      typeof draft.allergies === 'string'
        ? draft.allergies.trim()
        : '',
  };
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
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('');
  const [photoNotice, setPhotoNotice] = useState('');
  const [expandedSurgeryId, setExpandedSurgeryId] =
    useState(null);

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
      setLoadError(
        err?.message ||
          'We could not load your profile right now.',
      );
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const cleanups = RECOVERY_REALTIME_EVENTS.map(
      (eventName) =>
        subscribe(eventName, (payload) => {
          const patientId =
            payload?.patientId ||
            payload?.patient?.id ||
            payload?.userId;

          const currentPatientId =
            profile?.id ||
            profile?.userId;

          if (
            !patientId ||
            !currentPatientId ||
            patientId === currentPatientId
          ) {
            void load();
          }
        }),
    );

    return () => {
      cleanups.forEach((cleanup) => {
        if (typeof cleanup === 'function') {
          cleanup();
        }
      });
    };
  }, [
    subscribe,
    profile?.id,
    profile?.userId,
  ]);

  function updateDraft(field, value) {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));

    setFieldErrors((current) => ({
      ...current,
      [field]: '',
    }));

    setSaved(false);
    setSaveError('');
  }

  function validateAndSave(event) {
    event.preventDefault();

    if (!profile || saving) {
      return;
    }

    const errors = validateDraft(draft);

    setFieldErrors(errors);
    setSaveError('');
    setSaved(false);

    if (Object.keys(errors).length > 0) {
      const firstInvalidField = EDITABLE_FIELDS.find(
        (field) => errors[field],
      );

      if (firstInvalidField) {
        window.setTimeout(() => {
          document
            .getElementById(
              `patient-profile-${firstInvalidField}`,
            )
            ?.focus();
        }, 0);
      }

      return;
    }

    void persistProfile(buildPayload(draft));
  }

  async function persistProfile(payload) {
    setSaving(true);

    try {
      const res =
        await patientService.updateProfile(payload);

      const nextProfile =
        res?.data &&
        typeof res.data === 'object'
          ? res.data
          : {
              ...profile,
              ...payload,
            };

      setProfile(nextProfile);
      setDraft(normalizeDraft(nextProfile));
      setFieldErrors({});

      updateUserLocal({
        name:
          nextProfile.name ||
          payload.name,
      });

      setSaved(true);

      window.setTimeout(
        () => setSaved(false),
        3000,
      );
    } catch (err) {
      setSaveError(
        err?.message ||
          'We could not save your profile changes. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  function clearPhotoPreview() {
    setPhotoPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }

      return '';
    });
  }

  function validatePhoto(file) {
    if (!PROFILE_PHOTO_TYPES.includes(file.type)) {
      return 'Choose a JPG or PNG image.';
    }

    if (file.size > MAX_PROFILE_PHOTO_BYTES) {
      return 'Profile photos must be 5 MB or smaller.';
    }

    if (file.size === 0) {
      return 'The selected image is empty. Choose another photo.';
    }

    return '';
  }

  async function handlePhoto(event) {
    const file = event.target.files?.[0];

    event.target.value = '';

    if (!file || uploadingPhoto) {
      return;
    }

    setPhotoError('');
    setPhotoNotice('');

    const validationError = validatePhoto(file);

    if (validationError) {
      clearPhotoPreview();
      setPhotoError(validationError);
      return;
    }

    const previewUrl =
      URL.createObjectURL(file);

    setPhotoPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }

      return previewUrl;
    });

    setUploadingPhoto(true);

    try {
      const formData = new FormData();

      formData.append('photo', file);

      const res =
        await patientService.uploadProfilePhoto(
          formData,
        );

      const nextPhotoUrl = res?.data?.photoUrl;

      if (!nextPhotoUrl) {
        throw new Error(
          'The server did not return a profile photo URL.',
        );
      }

      setProfile((current) => ({
        ...current,
        photoUrl: nextPhotoUrl,
      }));

      updateUserLocal({
        photoUrl: nextPhotoUrl,
      });

      setPhotoNotice(
        'Profile photo updated successfully.',
      );
    } catch (err) {
      setPhotoError(
        err?.message ||
          'We could not update your profile photo. Please try again.',
      );
    } finally {
      setUploadingPhoto(false);
      clearPhotoPreview();
    }
  }

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
    };
  }, [photoPreviewUrl]);

  const ledger = useMemo(
    () => normalizeLedger(profile),
    [profile],
  );

  const currentCare = useMemo(
    () => normalizeCurrentCare(profile),
    [profile],
  );

  const completedSurgeries = ledger.filter(
    (item) => item._status === 'completed',
  ).length;

  const activeSurgeries = ledger.filter(
    (item) => item._status === 'active',
  ).length;

  const sortedLedger = useMemo(
    () =>
      [...ledger].sort((a, b) => {
        const aTime = a?._startDate
          ? new Date(
              `${a._startDate}T00:00:00`,
            ).getTime()
          : 0;

        const bTime = b?._startDate
          ? new Date(
              `${b._startDate}T00:00:00`,
            ).getTime()
          : 0;

        if (
          Number.isNaN(aTime) &&
          Number.isNaN(bTime)
        ) {
          return (
            a._historyIndex -
            b._historyIndex
          );
        }

        if (Number.isNaN(aTime)) {
          return 1;
        }

        if (Number.isNaN(bTime)) {
          return -1;
        }

        return (
          bTime - aTime ||
          a._historyIndex -
            b._historyIndex
        );
      }),
    [ledger],
  );

  const isDirty = profile
    ? JSON.stringify(
        buildPayload(draft),
      ) !==
      JSON.stringify(
        buildPayload(
          normalizeDraft(profile),
        ),
      )
    : false;

  if (!profile && !loadError) {
    return (
      <PatientDashboardShell>
        <PageHeader
          eyebrow="Your record"
          title="Your Profile"
          subtitle="Review your personal details and permanent surgical history."
        />

        <Panel className="patient-dashboard-state-panel">
          <LoadingState label="Loading your profile…" />
        </Panel>
      </PatientDashboardShell>
    );
  }

  if (!profile && loadError) {
    return (
      <PatientDashboardShell>
        <PageHeader
          eyebrow="Your record"
          title="Your Profile"
          subtitle="We could not retrieve your profile information right now."
        />

        <Panel className="patient-dashboard-state-panel">
          <EmptyState
            title="Profile temporarily unavailable"
            subtitle={loadError}
            action={
              <Button
                variant="primary"
                onClick={load}
              >
                Retry profile
              </Button>
            }
          />
        </Panel>
      </PatientDashboardShell>
    );
  }

  return (
    <PatientDashboardShell>
      <PageHeader
        eyebrow="Your record"
        title="Your Profile"
        subtitle="Keep your contact details current while your surgical history remains part of your permanent patient record."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          label="Surgical episodes"
          value={ledger.length}
          detail="Permanent history on file"
          accent="crimson"
        />

        <StatCard
          label="Completed episodes"
          value={completedSurgeries}
          detail="Retained for future care"
          accent="forest"
        />

        <StatCard
          label="Current care"
          value={
            activeSurgeries
              ? 'Active'
              : 'None'
          }
          detail={
            activeSurgeries
              ? 'Current recovery episode'
              : 'No active recovery episode'
          }
          accent={
            activeSurgeries
              ? 'gold'
              : 'ink'
          }
        />
      </div>

      {currentCare && (
        <Panel
          className="patient-current-care-panel mb-6"
          title="Current Recovery Episode"
          subtitle="This is the care relationship that is active now. It is separate from your permanent surgical history below."
        >
          <div className="mb-4 flex flex-col gap-3 rounded-lg border border-[var(--color-gold)] bg-[var(--color-parchment)] p-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-crimson)]">
                Active care only
              </p>

              <p className="mt-1 text-sm leading-6 text-[var(--color-text-soft)]">
                Your current doctor is connected
                to this recovery episode. A doctor
                listed in a previous surgery remains
                historical and does not become a
                permanent account assignment.
              </p>
            </div>

            <Badge variant="forest">
              {STATUS_LABELS[currentCare.status] ||
                currentCare.status ||
                'Active'}
            </Badge>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ProfileFact
              label="Current procedure"
              value={
                currentCare.surgeryName ||
                currentCare.procedure ||
                'Not recorded'
              }
            />

            <ProfileFact
              label="Current doctor"
              value={doctorLabel(
                currentCare.doctorName,
              )}
            />

            <ProfileFact
              label="Recovery started"
              value={formatDate(
                currentCare.startDate,
              )}
            />

            <ProfileFact
              label="Recovery days remaining"
              value={
                currentCare.daysRemaining ??
                'Not recorded'
              }
            />
          </div>
        </Panel>
      )}

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel
          className="xl:col-span-4"
          title="Profile Photo"
          subtitle="Use a clear, recent photo so your clinical team can identify your record easily. JPG or PNG, up to 5 MB."
        >
          <div className="flex flex-col items-center text-center">
            {photoPreviewUrl ? (
              <div
                className="mb-4"
                aria-live="polite"
              >
                <img
                  src={photoPreviewUrl}
                  alt="Selected profile photo preview"
                  className="h-28 w-28 rounded-full border-2 border-[var(--color-gold)] object-cover"
                />

                <p className="mt-2 text-xs text-[var(--color-text-soft)]">
                  Previewing the selected photo…
                </p>
              </div>
            ) : profile.photoUrl ? (
              <img
                src={`${API_BASE}${profile.photoUrl}`}
                alt={`${profile.name || 'Patient'} profile`}
                className="mb-4 h-28 w-28 rounded-full border-2 border-[var(--color-gold)] object-cover"
              />
            ) : (
              <div
                className="mb-4 flex h-28 w-28 items-center justify-center rounded-full bg-[var(--color-crimson)] text-4xl font-semibold text-white"
                aria-hidden="true"
              >
                {profile.name?.[0]?.toUpperCase() ||
                  'P'}
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              accept={PROFILE_PHOTO_ACCEPT}
              hidden
              onChange={handlePhoto}
            />

            <Button
              variant="outline"
              onClick={() =>
                fileRef.current?.click()
              }
              loading={uploadingPhoto}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto
                ? 'Updating photo…'
                : 'Choose Photo'}
            </Button>

            <p
              className="mt-2 text-xs text-[var(--color-text-soft)]"
              aria-live="polite"
            >
              {uploadingPhoto
                ? 'Uploading securely…'
                : 'Your existing photo stays visible until the new upload succeeds.'}
            </p>

            {photoError && (
              <Alert
                className="mt-3 w-full"
                variant="danger"
                title="Photo update failed"
                role="alert"
              >
                {photoError}
              </Alert>
            )}

            {photoNotice && (
              <Alert
                className="mt-3 w-full"
                variant="success"
                title="Photo updated"
                role="status"
                aria-live="polite"
              >
                {photoNotice}
              </Alert>
            )}
          </div>
        </Panel>

        <Panel
          className="xl:col-span-8"
          title="Personal Details"
          subtitle="Update your contact and personal information. Your login email remains fixed here."
        >
          <form
            onSubmit={validateAndSave}
            noValidate
            className="space-y-5"
          >
            <FormGrid columns={2}>
              <ValidatedField
                id="patient-profile-name"
                label="Full name"
                required
                value={draft.name || ''}
                error={fieldErrors.name}
                onChange={(value) =>
                  updateDraft('name', value)
                }
                autoComplete="name"
                maxLength={MAX_NAME_LENGTH}
              />

              <ValidatedField
                id="patient-profile-phone"
                label="Phone"
                value={draft.phone || ''}
                error={fieldErrors.phone}
                onChange={(value) =>
                  updateDraft('phone', value)
                }
                type="tel"
                autoComplete="tel"
                maxLength={MAX_PHONE_LENGTH}
                inputMode="tel"
              />
            </FormGrid>

            <Field
              label="Email"
              hint="Your login email cannot be changed from the patient profile."
            >
              <input
                className="field-input bg-[var(--color-parchment-deep)]"
                value={profile.email || ''}
                disabled
                aria-readonly="true"
                aria-label="Login email"
              />
            </Field>

            <ValidatedField
              id="patient-profile-address"
              label="Address"
              value={draft.address || ''}
              error={fieldErrors.address}
              onChange={(value) =>
                updateDraft('address', value)
              }
              multiline
              rows={2}
              maxLength={MAX_ADDRESS_LENGTH}
              autoComplete="street-address"
            />

            <FormGrid columns={3}>
              <Field
                label="Blood group"
                hint={
                  fieldErrors.bloodGroup ||
                  undefined
                }
              >
                <select
                  id="patient-profile-bloodGroup"
                  aria-label="Blood group"
                  className={`field-select${
                    fieldErrors.bloodGroup
                      ? ' border-[var(--color-danger)]'
                      : ''
                  }`}
                  value={
                    draft.bloodGroup || ''
                  }
                  onChange={(event) =>
                    updateDraft(
                      'bloodGroup',
                      event.target.value,
                    )
                  }
                  aria-invalid={Boolean(
                    fieldErrors.bloodGroup,
                  )}
                  aria-describedby={
                    fieldErrors.bloodGroup
                      ? 'patient-profile-bloodGroup-error'
                      : undefined
                  }
                >
                  <option value="">
                    Select
                  </option>

                  {BLOOD_GROUPS.map(
                    (group) => (
                      <option
                        key={group}
                        value={group}
                      >
                        {group}
                      </option>
                    ),
                  )}
                </select>

                {fieldErrors.bloodGroup && (
                  <p
                    id="patient-profile-bloodGroup-error"
                    className="field-error"
                    role="alert"
                  >
                    {fieldErrors.bloodGroup}
                  </p>
                )}
              </Field>

              <ValidatedField
                id="patient-profile-dateOfBirth"
                label="Date of birth"
                value={
                  draft.dateOfBirth || ''
                }
                error={
                  fieldErrors.dateOfBirth
                }
                onChange={(value) =>
                  updateDraft(
                    'dateOfBirth',
                    value,
                  )
                }
                type="date"
                autoComplete="bday"
              />

              <ValidatedField
                id="patient-profile-gender"
                label="Gender"
                value={draft.gender || ''}
                error={fieldErrors.gender}
                onChange={(value) =>
                  updateDraft(
                    'gender',
                    value,
                  )
                }
                maxLength={MAX_GENDER_LENGTH}
              />
            </FormGrid>

            <FormGrid columns={2}>
              <ValidatedField
                id="patient-profile-emergencyContact"
                label="Emergency contact"
                value={
                  draft.emergencyContact || ''
                }
                error={
                  fieldErrors.emergencyContact
                }
                onChange={(value) =>
                  updateDraft(
                    'emergencyContact',
                    value,
                  )
                }
                type="tel"
                autoComplete="tel"
                maxLength={
                  MAX_EMERGENCY_CONTACT_LENGTH
                }
                inputMode="tel"
              />

              <ValidatedField
                id="patient-profile-allergies"
                label="Allergies"
                hint="Keep this accurate so clinicians can review it when treating you."
                value={draft.allergies || ''}
                error={fieldErrors.allergies}
                onChange={(value) =>
                  updateDraft(
                    'allergies',
                    value,
                  )
                }
                multiline
                rows={2}
                maxLength={MAX_ALLERGIES_LENGTH}
              />
            </FormGrid>

            {saveError && (
              <Alert
                variant="danger"
                title="Profile could not be saved"
                role="alert"
              >
                {saveError}
              </Alert>
            )}

            {saved && (
              <Alert
                variant="success"
                title="Profile updated"
                role="status"
                aria-live="polite"
              >
                Your personal details have
                been saved.
              </Alert>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p
                className="text-xs text-[var(--color-text-soft)]"
                aria-live="polite"
              >
                {isDirty
                  ? 'You have unsaved changes.'
                  : 'Your profile is up to date.'}
              </p>

              <Button
                type="submit"
                variant="primary"
                loading={saving}
                disabled={
                  saving || !isDirty
                }
              >
                {saving
                  ? 'Saving…'
                  : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Panel>
      </div>

      <Panel
        title="Permanent Surgery History"
        subtitle="This record stays with your account for continuity of care, even when your current recovery doctor changes."
      >
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-soft)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--color-ink)]">
              Record completeness
            </p>

            <p className="text-xs leading-5 text-[var(--color-text-soft)]">
              Historical entries are retained
              even when older clinical fields
              were not recorded. Missing fields
              are shown explicitly rather than
              inferred.
            </p>
          </div>

          <Badge variant="muted">
            {ledger.length} record
            {ledger.length === 1
              ? ''
              : 's'}
          </Badge>
        </div>

        <SectionHeading
          title="Historical surgical episodes"
          subtitle="These records are permanent. The doctor shown on an earlier episode is historical and is not your current doctor unless that clinician is also assigned to your active recovery episode."
        />

        <div className="mb-5 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-soft)] p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="shrink-0 text-sm font-semibold text-[var(--color-ink)]">
              How to read this history
            </div>

            <p className="text-sm leading-6 text-[var(--color-text-soft)]">
              The timeline records what
              happened in previous surgical
              episodes. Your{' '}
              <strong className="font-semibold text-[var(--color-ink)]">
                Current Recovery Episode
              </strong>{' '}
              above is the only section
              that describes your active
              doctor relationship.
            </p>
          </div>
        </div>

        {sortedLedger.length === 0 ? (
          <EmptyState
            title="No surgical history on file yet"
            subtitle="Completed and active surgical episodes will appear here as they are recorded."
          />
        ) : (
          <div
            className="patient-surgery-timeline"
            aria-label="Permanent surgical history timeline"
          >
            {sortedLedger.map(
              (surgery, index) => {
                const surgeryKey =
                  surgery.id ||
                  surgery.careEpisodeId ||
                  surgery.episodeId ||
                  `history-${surgery._historyIndex}`;

                const expanded =
                  expandedSurgeryId ===
                  surgeryKey;

                const duration =
                  surgery._duration;

                const remaining =
                  surgery._remaining;

                const completedDays =
                  duration !== null &&
                  remaining !== null
                    ? Math.max(
                        duration -
                          remaining,
                        0,
                      )
                    : null;

                const hasEpisodeId =
                  Boolean(
                    surgery.careEpisodeId ||
                      surgery.episodeId,
                  );

                const hasUsefulDetail =
                  Boolean(
                    surgery._procedure ||
                      surgery._doctorName ||
                      surgery._startDate ||
                      surgery._dischargeDate ||
                      duration !== null ||
                      remaining !== null ||
                      hasEpisodeId,
                  );

                return (
                  <article
                    key={surgeryKey}
                    className={`patient-surgery-timeline-item${
                      expanded
                        ? ' is-expanded'
                        : ''
                    }`}
                    aria-label={`${
                      surgery._procedure ||
                      'Surgical episode'
                    }, ${
                      STATUS_LABELS[
                        surgery._status
                      ] ||
                      'Recorded'
                    }`}
                  >
                    <div
                      className="patient-surgery-timeline-marker"
                      aria-hidden="true"
                    >
                      {index + 1}
                    </div>

                    <div className="patient-surgery-timeline-card rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]">
                      <button
                        type="button"
                        className="patient-surgery-timeline-toggle w-full p-4 text-left sm:p-5"
                        aria-expanded={
                          expanded
                        }
                        aria-controls={`surgery-episode-${index}`}
                        onClick={() =>
                          setExpandedSurgeryId(
                            expanded
                              ? null
                              : surgeryKey,
                          )
                        }
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <h2 className="break-words font-semibold text-[var(--color-ink)]">
                                {surgery._procedure ||
                                  'Procedure not recorded'}
                              </h2>

                              <Badge
                                variant={
                                  surgery._status ===
                                  'active'
                                    ? 'forest'
                                    : 'muted'
                                }
                              >
                                {STATUS_LABELS[
                                  surgery
                                    ._status
                                ] ||
                                  'Recorded'}
                              </Badge>

                              {currentCare &&
                                (
                                  surgery.careEpisodeId ||
                                  surgery.episodeId
                                ) ===
                                  (
                                    currentCare.careEpisodeId ||
                                    currentCare.id
                                  ) && (
                                  <Badge variant="gold">
                                    Current recovery
                                  </Badge>
                                )}
                            </div>

                            <p className="break-words text-sm text-[var(--color-text-soft)]">
                              Started{' '}
                              {formatDate(
                                surgery._startDate,
                              )}

                              {surgery._dischargeDate
                                ? ` · Discharged ${formatDate(
                                    surgery._dischargeDate,
                                  )}`
                                : ''}
                            </p>
                          </div>

                          <div className="shrink-0 text-sm text-[var(--color-text-soft)] sm:text-right">
                            <p>
                              {duration
                                ? `${duration} day recovery plan`
                                : 'Recovery duration not recorded'}
                            </p>

                            {surgery._status ===
                              'active' &&
                              remaining !==
                                null && (
                                <p className="mt-1 font-medium text-[var(--color-ink)]">
                                  {remaining} days
                                  remaining
                                </p>
                              )}

                            <span className="mt-2 inline-block text-xs font-semibold text-[var(--color-crimson)]">
                              {expanded
                                ? 'Hide episode details'
                                : 'View episode details'}
                            </span>
                          </div>
                        </div>
                      </button>

                      {expanded && (
                        <div
                          id={`surgery-episode-${index}`}
                          className="border-t border-[var(--color-line)] px-4 pb-5 pt-4 sm:px-5"
                        >
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <ProfileFact
                              label="Procedure"
                              value={
                                surgery._procedure ||
                                'Not recorded'
                              }
                            />

                            <ProfileFact
                              label="Historical doctor"
                              value={
                                surgery._doctorName
                                  ? doctorLabel(
                                      surgery._doctorName,
                                    )
                                  : 'Doctor not recorded'
                              }
                            />

                            <ProfileFact
                              label="Started"
                              value={formatDate(
                                surgery._startDate,
                              )}
                            />

                            <ProfileFact
                              label="Discharged"
                              value={formatDate(
                                surgery._dischargeDate,
                              )}
                            />

                            <ProfileFact
                              label="Care status"
                              value={
                                STATUS_LABELS[
                                  surgery._status
                                ] ||
                                'Recorded'
                              }
                            />

                            <ProfileFact
                              label="Recovery plan"
                              value={
                                duration
                                  ? `${duration} days`
                                  : 'Not recorded'
                              }
                            />

                            <ProfileFact
                              label="Recovery progress"
                              value={
                                completedDays !==
                                null
                                  ? `${completedDays} of ${duration} days`
                                  : 'Not recorded'
                              }
                            />

                            {hasEpisodeId && (
                              <ProfileFact
                                label="Episode reference"
                                value={
                                  surgery.careEpisodeId ||
                                  surgery.episodeId
                                }
                              />
                            )}
                          </div>

                          <p className="mt-4 text-xs leading-5 text-[var(--color-text-soft)]">
                            This doctor entry describes
                            the clinician associated with
                            this historical surgical episode.
                            It does not permanently assign
                            your account to that doctor.
                            Your current doctor relationship
                            is scoped to your active recovery
                            episode.
                          </p>

                          {!hasUsefulDetail && (
                            <Alert
                              className="mt-3"
                              variant="warning"
                              title="Limited episode details"
                            >
                              This historical entry is
                              retained, but some episode
                              details have not been recorded
                              yet. The record itself remains
                              part of your permanent history.
                            </Alert>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              },
            )}
          </div>
        )}
      </Panel>

      <p className="mt-6 text-xs leading-5 text-[var(--color-text-soft)]">
        CasterlyCare profile information supports
        care coordination and record continuity.
        Keep important medical details accurate
        and tell your clinical team about any
        changes that could affect your care.
      </p>
    </PatientDashboardShell>
  );
}

function ValidatedField({
  id,
  label,
  required = false,
  value,
  error,
  hint,
  onChange,
  type = 'text',
  multiline = false,
  rows = 2,
  maxLength,
  autoComplete,
  inputMode,
}) {
  const describedBy =
    [
      hint ? `${id}-hint` : '',
      error ? `${id}-error` : '',
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div className="form-control-group">
      <label
        className="field-label"
        htmlFor={id}
      >
        {label}
        {required ? (
          <span aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </label>

      {hint && !error && (
        <span
          id={`${id}-hint`}
          className="sr-only"
        >
          {hint}
        </span>
      )}

      {multiline ? (
        <textarea
          id={id}
          rows={rows}
          className={`field-textarea${
            error
              ? ' border-[var(--color-danger)]'
              : ''
          }`}
          value={value}
          onChange={(event) =>
            onChange(
              event.target.value,
            )
          }
          maxLength={maxLength}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
        />
      ) : (
        <input
          id={id}
          type={type}
          className={`field-input${
            error
              ? ' border-[var(--color-danger)]'
              : ''
          }`}
          value={value}
          onChange={(event) =>
            onChange(
              event.target.value,
            )
          }
          maxLength={maxLength}
          autoComplete={autoComplete}
          inputMode={inputMode}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
        />
      )}

      {error && (
        <p
          id={`${id}-error`}
          className="field-error"
          role="alert"
        >
          {error}
        </p>
      )}

      {hint && !error && (
        <p className="form-help">
          {hint}
        </p>
      )}
    </div>
  );
}

function ProfileFact({
  label,
  value,
}) {
  return (
    <div className="min-w-0 rounded-md bg-[var(--color-parchment)] p-3">
      <p className="text-xs uppercase tracking-[0.08em] text-[var(--color-text-soft)]">
        {label}
      </p>

      <div className="mt-1 break-words font-medium text-[var(--color-ink)]">
        {value}
      </div>
    </div>
  );
}