// Phase 2.12.4 — Admin Emergency SOS Escalation & Dispatch UX
import NavIcon from '../../components/NavIcon';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminService } from '../../api/services/admin';
import { apiErrorMessage } from '../../api/client';
import { AdminDashboardShell as DashboardShell } from '../../components/RoleDashboardShell';
import { useRealtime } from '../../context/RealtimeContext';
import { SOS_REALTIME_EVENTS } from '../../config/realtimeEvents';
import {
  Alert,
  Badge,
  Button,
  ConfirmModal,
  EmptyState,
  LoadingState,
  PageHeader,
  Panel,
  StatCard,
} from '../../components/ui';

function formatDate(value) {
  if (!value) return 'Not recorded';

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? 'Not recorded'
    : date.toLocaleString([], {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
}

function snapshot(value, fallback = 'Not recorded') {
  return value || fallback;
}

function normalizeEscalations(value) {
  let source = [];

  if (Array.isArray(value)) {
    source = value;
  } else if (Array.isArray(value?.escalations)) {
    source = value.escalations;
  } else if (Array.isArray(value?.data)) {
    source = value.data;
  }

  return source.map((alert) => ({
    ...alert,

    patientNameSnapshot:
      alert?.patientNameSnapshot ||
      alert?.patient?.name ||
      alert?.patientName ||
      'Patient',

    surgerySnapshot:
      alert?.surgerySnapshot ||
      alert?.surgery?.surgeryName ||
      alert?.careEpisode?.surgery?.surgeryName ||
      'Surgery not recorded',

    bloodGroupSnapshot:
      alert?.bloodGroupSnapshot ||
      alert?.patient?.bloodGroup ||
      alert?.bloodGroup ||
      'Not recorded',

    doctorNameSnapshot:
      alert?.doctorNameSnapshot ||
      alert?.doctor?.name ||
      alert?.doctorName ||
      'Doctor',

    doctorDutyStatus:
      alert?.doctorDutyStatus ||
      alert?.doctor?.doctorProfile?.dutyStatus ||
      null,

    status:
      alert?.status ||
      'escalated',

    createdAt:
      alert?.createdAt ||
      alert?.triggeredAt ||
      alert?.created_at ||
      null,
  }));
}

export default function AdminEscalations() {
  const { subscribe } = useRealtime();
  const [escalations, setEscalations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [selected, setSelected] = useState(null);
  const [dispatchingId, setDispatchingId] = useState('');

  const load = useCallback(
    async ({ background = false } = {}) => {
      setError('');

      if (!background) setLoading(true);

      try {
        const response = await adminService.getEscalations();

        const normalized = normalizeEscalations(
          response?.data,
        );

        setEscalations(normalized);
      } catch (loadError) {
        setError(
          `Unable to load the emergency escalation queue — ${apiErrorMessage(
            loadError,
          )}`,
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  /*
   * This queue is safety-critical (it is the only place an
   * off-duty/deactivated doctor's escalated SOS alert becomes
   * visible to anyone), so it gets both an instant socket push
   * and a polling fallback - the socket alone is not trusted as
   * the sole delivery path in case a connection drops silently.
   */
  useEffect(() => {
    const cleanups = SOS_REALTIME_EVENTS.map((eventName) =>
      subscribe(eventName, () => load({ background: true })),
    );
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [subscribe, load]);

  useEffect(() => {
    const interval = window.setInterval(() => load({ background: true }), 10000);
    return () => window.clearInterval(interval);
  }, [load]);

  const activeEscalations = useMemo(
    () =>
      (escalations || []).filter(
        (alert) =>
          alert?.status === 'escalated' ||
          !alert?.status,
      ),
    [escalations],
  );

  const handledEscalations = useMemo(
    () =>
      (escalations || []).filter(
        (alert) =>
          alert?.status &&
          alert.status !== 'escalated',
      ),
    [escalations],
  );

  async function dispatch(alert) {
    if (!alert?.id || dispatchingId) {
      return;
    }

    setActionError('');
    setSuccess('');
    setDispatchingId(alert.id);

    try {
      await adminService.dispatchEscalation(alert.id);

      setSelected(null);

      setSuccess(
        'Emergency dispatch initiated and the escalation queue was updated.',
      );

      await load({ background: true });
    } catch (dispatchError) {
      setActionError(
        `Emergency dispatch could not be initiated — ${apiErrorMessage(
          dispatchError,
        )}`,
      );
    } finally {
      setDispatchingId('');
    }
  }

  return (
    <DashboardShell>
      <div className="admin-escalations-page">
        <PageHeader
          title="SOS Escalations"
          subtitle="Alerts routed to administration when the assigned doctor is off duty. Review the patient snapshot and act without delay."
        />

        {error ? (
          <div
            className="mb-6"
            aria-live="assertive"
          >
            <Alert
              variant="danger"
              title="Emergency queue unavailable"
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
              variant="danger"
              title="Dispatch action failed"
            >
              {actionError}
            </Alert>
          </div>
        ) : null}

        {success ? (
          <div
            className="mb-6"
            aria-live="polite"
          >
            <Alert
              variant="success"
              title="Dispatch update"
            >
              {success}
            </Alert>
          </div>
        ) : null}

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
          <StatCard
            label="Needs action" icon={<NavIcon name="alert" size={44} />}
            value={activeEscalations.length}
            detail="Awaiting dispatch"
            accent={activeEscalations.length > 0 ? 'danger' : 'sand'}
          />

          <StatCard
            label="Queue records" icon={<NavIcon name="inbox" size={44} />}
            value={(escalations || []).length}
            detail="Total records"
            accent="gold"
          />
        </div>

        {loading && escalations === null ? (
          <LoadingState label="Loading emergency escalations…" />
        ) : (
          <div className="space-y-6">
            <Panel
              title="Active emergency escalations"
              subtitle="Only escalations that still require administrative action appear here."
            >
              {activeEscalations.length === 0 ? (
                <div className="admin-allclear" role="status">
                  <div>
                    <strong>All clear</strong>
                    <p>
                      There are no SOS alerts currently awaiting administrative action.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeEscalations.map((alert) => (
                    <article
                      key={alert.id}
                      className="admin-escalation-card"
                      aria-label={`Emergency escalation for ${snapshot(
                        alert.patientNameSnapshot,
                        'patient',
                      )}`}
                    >
                      <div className="admin-escalation-card-main">
                        <div className="admin-escalation-badges">
                          <Badge variant="danger">
                            Emergency
                          </Badge>

                          <Badge variant="amber">
                            Doctor off duty
                          </Badge>
                        </div>

                        <div className="admin-escalation-heading">
                          <div>
                            <p className="admin-escalation-patient">
                              {snapshot(
                                alert.patientNameSnapshot,
                                'Patient',
                              )}
                            </p>

                            <p className="admin-escalation-subtitle">
                              {snapshot(
                                alert.surgerySnapshot,
                              )}{' '}
                              · Blood group{' '}
                              {snapshot(
                                alert.bloodGroupSnapshot,
                              )}
                            </p>
                          </div>

                          <div className="admin-escalation-time">
                            <span>Triggered</span>

                            <strong>
                              {formatDate(
                                alert.createdAt,
                              )}
                            </strong>
                          </div>
                        </div>

                        <dl className="admin-escalation-details">
                          <div>
                            <dt>Assigned doctor</dt>
                            <dd>
                              {snapshot(
                                alert.doctorNameSnapshot,
                              )}
                            </dd>
                          </div>

                          <div>
                            <dt>Original alert</dt>
                            <dd>
                              {snapshot(alert.id)}
                            </dd>
                          </div>

                          <div>
                            <dt>Status</dt>
                            <dd>
                              {snapshot(
                                alert.status,
                              )}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      <div className="admin-escalation-actions">
                        <p className="admin-escalation-action-note">
                          Confirm the patient snapshot before
                          dispatching emergency support.
                        </p>

                        <Button
                          variant="danger"
                          onClick={() =>
                            setSelected(alert)
                          }
                          disabled={Boolean(
                            dispatchingId,
                          )}
                        >
                          Initiate emergency dispatch
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </Panel>

            <Panel
              title="Previously handled records"
              subtitle="Historical escalation records remain visible for operational traceability."
            >
              {handledEscalations.length === 0 ? (
                <EmptyState
                  title="No handled records in this response"
                  subtitle="Completed or otherwise resolved escalation records will appear here when returned by the service."
                />
              ) : (
                <div className="space-y-3">
                  {handledEscalations.map((alert) => (
                    <div
                      key={alert.id}
                      className="admin-escalation-history-row"
                    >
                      <div>
                        <p className="font-semibold text-[var(--color-ink)]">
                          {snapshot(
                            alert.patientNameSnapshot,
                            'Patient',
                          )}
                        </p>

                        <p className="text-xs text-[var(--color-text-soft)]">
                          {snapshot(
                            alert.surgerySnapshot,
                          )}{' '}
                          ·{' '}
                          {formatDate(
                            alert.createdAt,
                          )}
                        </p>
                      </div>

                      <Badge variant="forest">
                        {alert.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        )}

        <p
          className="admin-escalations-disclaimer"
          role="note"
        >
          This queue supports emergency coordination. The
          administrator should use established hospital
          emergency procedures alongside this workflow; the
          interface does not replace emergency medical
          services.
        </p>
      </div>

      <ConfirmModal
        open={Boolean(selected)}
        title="Initiate emergency dispatch?"
        eyebrow="Administrative emergency action"
        body={
          selected
            ? `You are about to initiate emergency dispatch for ${snapshot(
                selected.patientNameSnapshot,
                'this patient',
              )}. This alert was routed here because the assigned doctor was off duty. Confirm the patient and surgery details before proceeding.`
            : ''
        }
        confirmLabel={
          dispatchingId
            ? 'Dispatching…'
            : 'Confirm dispatch'
        }
        variant="danger"
        tone="danger"
        confirmDisabled={Boolean(dispatchingId)}
        onCancel={() => {
          if (!dispatchingId) {
            setSelected(null);
          }
        }}
        onConfirm={() => dispatch(selected)}
      />
    </DashboardShell>
  );
}