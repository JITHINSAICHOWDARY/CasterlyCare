// Phase 2.12.2 — Admin Doctor Management UX
import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminService } from '../../api/services/admin';
import { apiErrorMessage } from '../../api/client';
import { useRealtime } from '../../context/RealtimeContext';
import { REALTIME_EVENTS } from '../../config/realtimeEvents';
import { AdminDashboardShell as DashboardShell } from '../../components/RoleDashboardShell';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  FormGrid,
  LoadingState,
  Modal,
  PageHeader,
  Panel,
  SectionHeading,
} from '../../components/ui';

function normalizeDoctors(value) {
  if (Array.isArray(value)) {
    return value.map((doctor) => ({
      ...doctor,
      uniqueDoctorId:
        doctor?.uniqueDoctorId ||
        doctor?.doctorProfile?.uniqueDoctorId ||
        null,
      specialization:
        doctor?.specialization ||
        doctor?.doctorProfile?.specialization ||
        null,
      dutyStatus:
        doctor?.dutyStatus ||
        doctor?.doctorProfile?.dutyStatus ||
        'off_duty',
      bio:
        doctor?.bio ||
        doctor?.doctorProfile?.bio ||
        null,
    }));
  }

  if (Array.isArray(value?.doctors)) {
    return normalizeDoctors(value.doctors);
  }

  if (Array.isArray(value?.data)) {
    return normalizeDoctors(value.data);
  }

  return [];
}

function dutyLabel(status) {
  return status === 'on_duty' ? 'On Duty' : 'Off Duty';
}

function doctorStatusLabel(active) {
  return active ? 'Active' : 'Deactivated';
}

function matchesSearch(doctor, query) {
  if (!query) return true;

  const haystack = [
    doctor?.name,
    doctor?.email,
    doctor?.specialization,
    doctor?.uniqueDoctorId,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

export default function AdminDoctors() {
  const [doctors, setDoctors] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [createdDoctor, setCreatedDoctor] = useState(null);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const { subscribe } = useRealtime();

  const loadDoctors = useCallback(async ({ background = false } = {}) => {
    setError('');

    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await adminService.getDoctors();

      const normalizedDoctors = normalizeDoctors(res?.data);

      setDoctors(normalizedDoctors);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDoctors();
  }, [loadDoctors]);

  useEffect(
    () =>
      subscribe(
        REALTIME_EVENTS.DOCTOR_DUTY_UPDATED,
        () => loadDoctors({ background: true }),
      ),
    [subscribe, loadDoctors],
  );

  const counts = useMemo(() => {
    const list = doctors || [];

    return {
      total: list.length,
      active: list.filter((doctor) => doctor?.isActive).length,
      inactive: list.filter((doctor) => !doctor?.isActive).length,
      onDuty: list.filter(
        (doctor) =>
          doctor?.isActive &&
          doctor?.dutyStatus === 'on_duty',
      ).length,
    };
  }, [doctors]);

  const visibleDoctors = useMemo(() => {
    const list = normalizeDoctors(doctors);

    return list
      .filter((doctor) => {
        if (filter === 'active') return doctor?.isActive;
        if (filter === 'inactive') return !doctor?.isActive;

        if (filter === 'on_duty') {
          return (
            doctor?.isActive &&
            doctor?.dutyStatus === 'on_duty'
          );
        }

        return true;
      })
      .filter((doctor) => matchesSearch(doctor, query))
      .sort((a, b) =>
        `${a?.name || ''}`.localeCompare(
          `${b?.name || ''}`,
        ),
      );
  }, [doctors, filter, query]);

  async function handleToggle(doctor) {
    setActionError('');

    const action = doctor?.isActive
      ? 'deactivate'
      : 'activate';

    const actionLabel = doctor?.isActive
      ? 'deactivate'
      : 'reactivate';

    const confirmed = window.confirm(
      doctor?.isActive
        ? `Deactivate ${doctor?.name || 'this doctor'}? Their login access will be removed, while historical records remain preserved.`
        : `Reactivate ${doctor?.name || 'this doctor'}? Their existing account will regain login access.`,
    );

    if (!confirmed) return;

    try {
      await adminService.setDoctorStatus(
        doctor.id,
        action,
      );

      await loadDoctors({ background: true });
    } catch (err) {
      setActionError(
        `Could not ${actionLabel} ${
          doctor?.name || 'the doctor'
        }. ${apiErrorMessage(err)}`,
      );
    }
  }

  function openAdd() {
    setCreatedDoctor(null);
    setActionError('');
    setShowAdd(true);
  }

  function closeAdd() {
    setShowAdd(false);
    setCreatedDoctor(null);
  }

  return (
    <DashboardShell>
      <div className="admin-doctors-page">
        <PageHeader
          eyebrow="Clinical team"
          title="Manage Doctors"
          subtitle="Create clinician accounts, review duty status, and control login access without removing historical records."
          action={(
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  loadDoctors({ background: true })
                }
                loading={refreshing}
              >
                Refresh
              </Button>

              <Button
                variant="primary"
                onClick={openAdd}
              >
                + Add Doctor
              </Button>
            </div>
          )}
        />

        {error ? (
          <div
            className="mb-6"
            aria-live="assertive"
          >
            <Alert
              variant="danger"
              title="Doctor list unavailable"
            >
              {error}
            </Alert>
          </div>
        ) : null}

        {actionError ? (
          <div
            className="mb-6"
            aria-live="assertive"
          >
            <Alert
              variant="warning"
              title="Action not completed"
            >
              {actionError}
            </Alert>
          </div>
        ) : null}

        {!doctors && loading ? (
          <LoadingState label="Loading the clinical team…" />
        ) : (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
              <ManagementStat
                label="All doctors"
                value={counts.total}
                detail="Clinician accounts"
              />

              <ManagementStat
                label="Active"
                value={counts.active}
                detail="Login access enabled"
              />

              <ManagementStat
                label="Off duty / inactive"
                value={counts.inactive}
                detail="Inactive accounts"
              />

              <ManagementStat
                label="On duty"
                value={counts.onDuty}
                detail="Currently available"
              />
            </div>

            <Panel className="mb-6">
              <div className="flex flex-col lg:flex-row lg:items-end gap-4">
                <div className="flex-1">
                  <label
                    className="field-label"
                    htmlFor="doctor-search"
                  >
                    Search doctors
                  </label>

                  <input
                    id="doctor-search"
                    className="field-input"
                    value={query}
                    onChange={(event) =>
                      setQuery(event.target.value)
                    }
                    placeholder="Search by name, email, specialization, or Doctor ID"
                    autoComplete="off"
                  />
                </div>

                <div className="min-w-[220px]">
                  <label
                    className="field-label"
                    htmlFor="doctor-filter"
                  >
                    Filter
                  </label>

                  <select
                    id="doctor-filter"
                    className="field-input"
                    value={filter}
                    onChange={(event) =>
                      setFilter(event.target.value)
                    }
                  >
                    <option value="all">
                      All doctors
                    </option>

                    <option value="active">
                      Active only
                    </option>

                    <option value="inactive">
                      Deactivated only
                    </option>

                    <option value="on_duty">
                      On duty only
                    </option>
                  </select>
                </div>
              </div>
            </Panel>

            <Panel>
              <SectionHeading
                title="Clinical team"
                subtitle={`${visibleDoctors.length} doctor${
                  visibleDoctors.length === 1
                    ? ''
                    : 's'
                } shown`}
              />

              {visibleDoctors.length === 0 ? (
                <EmptyState
                  title={
                    doctors?.length
                      ? 'No doctors match this view'
                      : 'No doctors yet'
                  }
                  subtitle={
                    doctors?.length
                      ? 'Try a different search or filter.'
                      : 'Create the first clinician account to begin building the care team.'
                  }
                  action={
                    doctors?.length ? (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setQuery('');
                          setFilter('all');
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        onClick={openAdd}
                      >
                        Add Doctor
                      </Button>
                    )
                  }
                />
              ) : (
                <div
                  className="overflow-x-auto"
                  role="region"
                  aria-label="Doctor management table"
                  tabIndex="0"
                >
                  <table className="w-full text-sm admin-doctor-table">
                    <caption className="sr-only">
                      Doctor accounts and administrative status
                    </caption>

                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-text-soft)] border-b border-[var(--color-line)]">
                        <th
                          scope="col"
                          className="pb-3 pr-4"
                        >
                          Doctor
                        </th>

                        <th
                          scope="col"
                          className="pb-3 pr-4"
                        >
                          Specialization
                        </th>

                        <th
                          scope="col"
                          className="pb-3 pr-4"
                        >
                          Unique ID
                        </th>

                        <th
                          scope="col"
                          className="pb-3 pr-4"
                        >
                          Duty
                        </th>

                        <th
                          scope="col"
                          className="pb-3 pr-4"
                        >
                          Account
                        </th>

                        <th
                          scope="col"
                          className="pb-3 text-right"
                        >
                          Action
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {visibleDoctors.map((doctor) => (
                        <tr
                          key={doctor.id}
                          className="border-b border-[var(--color-line)] last:border-0 align-top"
                        >
                          <td className="py-4 pr-4">
                            <button
                              type="button"
                              className="text-left group"
                              onClick={() =>
                                setSelectedDoctor(doctor)
                              }
                              aria-label={`View ${
                                doctor?.name || 'doctor'
                              } details`}
                            >
                              <span className="block font-semibold text-[var(--color-ink)] group-hover:text-[var(--color-crimson)]">
                                {doctor?.name ||
                                  'Unnamed doctor'}
                              </span>

                              <span className="block mt-1 text-[var(--color-text-soft)]">
                                {doctor?.email ||
                                  'Email not recorded'}
                              </span>
                            </button>
                          </td>

                          <td className="py-4 pr-4 text-[var(--color-text-soft)]">
                            {doctor?.specialization ||
                              'Not specified'}
                          </td>

                          <td className="py-4 pr-4">
                            <Badge variant="gold">
                              {doctor?.uniqueDoctorId ||
                                'Not assigned'}
                            </Badge>
                          </td>

                          <td className="py-4 pr-4">
                            <Badge
                              variant={
                                doctor?.dutyStatus ===
                                'on_duty'
                                  ? 'forest'
                                  : 'amber'
                              }
                            >
                              {dutyLabel(
                                doctor?.dutyStatus,
                              )}
                            </Badge>
                          </td>

                          <td className="py-4 pr-4">
                            <Badge
                              variant={
                                doctor?.isActive
                                  ? 'forest'
                                  : 'danger'
                              }
                            >
                              {doctorStatusLabel(
                                doctor?.isActive,
                              )}
                            </Badge>
                          </td>

                          <td className="py-4 text-right">
                            <Button
                              variant={
                                doctor?.isActive
                                  ? 'outline'
                                  : 'gold'
                              }
                              onClick={() =>
                                handleToggle(doctor)
                              }
                            >
                              {doctor?.isActive
                                ? 'Deactivate'
                                : 'Reactivate'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </>
        )}

        <AddDoctorModal
          open={showAdd}
          onClose={closeAdd}
          onCreated={(doctor) => {
            setCreatedDoctor(doctor);
            loadDoctors({ background: true });
          }}
          result={createdDoctor}
        />

        <DoctorDetailsModal
          doctor={selectedDoctor}
          onClose={() =>
            setSelectedDoctor(null)
          }
        />
      </div>
    </DashboardShell>
  );
}

function ManagementStat({
  label,
  value,
  detail,
}) {
  return (
    <div className="admin-management-stat panel">
      <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-text-soft)]">
        {label}
      </p>

      <p className="font-display text-3xl text-[var(--color-crimson)] mt-2">
        {value}
      </p>

      <p className="text-xs text-[var(--color-muted)] mt-1">
        {detail}
      </p>
    </div>
  );
}

function AddDoctorModal({
  open,
  onClose,
  onCreated,
  result,
}) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    specialization: '',
  });

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function update(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError('');
    setBusy(true);

    try {
      const res = await adminService.createDoctor({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        specialization: form.specialization.trim(),
      });

      const created = res?.data?.doctor;

      onCreated(created);

      setForm({
        name: '',
        email: '',
        password: '',
        specialization: '',
      });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Add a Doctor"
      onClose={onClose}
    >
      {result ? (
        <div className="space-y-5">
          <Alert
            variant="success"
            title="Doctor account created"
          >
            The clinician account is ready. Share the
            login details securely rather than placing them
            in general notes or chat.
          </Alert>

          <div className="panel p-4">
            <p className="field-label">Doctor</p>

            <p className="font-semibold text-[var(--color-ink)]">
              {result?.name}
            </p>

            <p className="text-sm text-[var(--color-text-soft)] mt-1">
              {result?.email}
            </p>
          </div>

          <div className="panel p-4">
            <p className="field-label">
              Unique Doctor ID
            </p>

            <p className="font-display text-2xl text-[var(--color-crimson)]">
              {result?.uniqueDoctorId ||
                result?.doctorProfile?.uniqueDoctorId ||
                'Not assigned'}
            </p>

            <p className="text-xs text-[var(--color-muted)] mt-2">
              This identifier is used when a patient begins
              a recovery episode with this doctor.
            </p>
          </div>

          <Button
            variant="primary"
            className="w-full"
            onClick={onClose}
          >
            Done
          </Button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="space-y-5"
        >
          <FormGrid>
            <div>
              <label
                className="field-label"
                htmlFor="doctor-name"
              >
                Full name
              </label>

              <input
                id="doctor-name"
                required
                className="field-input"
                value={form.name}
                onChange={(e) =>
                  update('name', e.target.value)
                }
                autoComplete="name"
              />
            </div>

            <div>
              <label
                className="field-label"
                htmlFor="doctor-specialization"
              >
                Specialization
              </label>

              <input
                id="doctor-specialization"
                className="field-input"
                placeholder="e.g. Orthopedic Surgery"
                value={form.specialization}
                onChange={(e) =>
                  update(
                    'specialization',
                    e.target.value,
                  )
                }
              />
            </div>
          </FormGrid>

          <div>
            <label
              className="field-label"
              htmlFor="doctor-email"
            >
              Login email
            </label>

            <input
              id="doctor-email"
              type="email"
              required
              className="field-input"
              value={form.email}
              onChange={(e) =>
                update('email', e.target.value)
              }
              autoComplete="email"
            />
          </div>

          <div>
            <label
              className="field-label"
              htmlFor="doctor-password"
            >
              Temporary password
            </label>

            <input
              id="doctor-password"
              type="password"
              required
              minLength={6}
              className="field-input"
              value={form.password}
              onChange={(e) =>
                update('password', e.target.value)
              }
              autoComplete="new-password"
            />

            <p className="field-help">
              Use a temporary password and transfer it to
              the doctor through a secure channel.
            </p>
          </div>

          {error ? (
            <Alert
              variant="danger"
              title="Could not create the account"
            >
              {error}
            </Alert>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={busy}
          >
            Create Doctor Account
          </Button>
        </form>
      )}
    </Modal>
  );
}

function DoctorDetailsModal({
  doctor,
  onClose,
}) {
  return (
    <Modal
      open={!!doctor}
      title="Doctor Account"
      onClose={onClose}
    >
      {doctor ? (
        <div className="space-y-4">
          <div>
            <p className="field-label">Name</p>

            <p className="text-lg font-semibold text-[var(--color-ink)]">
              {doctor?.name || 'Unnamed doctor'}
            </p>
          </div>

          <div>
            <p className="field-label">Email</p>

            <p className="text-[var(--color-text-soft)]">
              {doctor?.email || 'Not recorded'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="panel p-4">
              <p className="field-label">
                Specialization
              </p>

              <p className="font-medium text-[var(--color-ink)]">
                {doctor?.specialization ||
                  doctor?.doctorProfile
                    ?.specialization ||
                  'Not specified'}
              </p>
            </div>

            <div className="panel p-4">
              <p className="field-label">
                Unique Doctor ID
              </p>

              <p className="font-semibold text-[var(--color-crimson)]">
                {doctor?.uniqueDoctorId ||
                  doctor?.doctorProfile
                    ?.uniqueDoctorId ||
                  'Not assigned'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge
              variant={
                doctor?.isActive
                  ? 'forest'
                  : 'danger'
              }
            >
              {doctorStatusLabel(
                doctor?.isActive,
              )}
            </Badge>

            <Badge
              variant={
                (doctor?.dutyStatus ||
                  doctor?.doctorProfile
                    ?.dutyStatus) === 'on_duty'
                  ? 'forest'
                  : 'amber'
              }
            >
              {dutyLabel(
                doctor?.dutyStatus ||
                  doctor?.doctorProfile
                    ?.dutyStatus,
              )}
            </Badge>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}