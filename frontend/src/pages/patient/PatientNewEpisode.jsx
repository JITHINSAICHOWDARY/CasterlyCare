import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PatientDashboardShell } from '../../components/RoleDashboardShell';
import { Alert, Button, EmptyState, Field, LoadingState, Panel, PageHeader } from '../../components/ui';
import GlassLensFilter from '../../components/GlassLensFilter';
import DatePicker from '../../components/DatePicker';
import { patientService } from '../../api/services/patient';

// Local date components, not toISOString (which converts to UTC and can
// shift "today" to yesterday or tomorrow depending on the timezone offset).
function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayLocalDate() {
  return localDate(new Date());
}

function yearsAgoLocalDate(years) {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return localDate(date);
}

const INITIAL_FORM = { doctorUniqueId: '', specialization: '', surgeryName: '', surgeryDate: todayLocalDate() };

export default function PatientNewEpisode() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [hasActiveCareEpisode, setHasActiveCareEpisode] = useState(false);
  const [activeSurgeryName, setActiveSurgeryName] = useState('');
  const [specializations, setSpecializations] = useState([]);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [home, options] = await Promise.all([
          patientService.getHome(),
          patientService.getDoctorSpecializations(),
        ]);
        if (cancelled) return;
        setHasActiveCareEpisode(Boolean(home.data?.hasActiveCareEpisode));
        setActiveSurgeryName(home.data?.activeCareEpisode?.surgeryName || '');
        setSpecializations(options.data?.specializations || []);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Could not load this page. Please try again.');
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  function updateField(key) {
    return (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await patientService.startCareEpisode({
        doctorUniqueId: form.doctorUniqueId,
        specialization: form.specialization,
        surgeryName: form.surgeryName,
        surgeryDate: form.surgeryDate,
      });
      navigate('/patient');
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not start a new recovery episode. Please double-check the details.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PatientDashboardShell>
      <div className="patient-new-episode-page">
      <GlassLensFilter />
      <PageHeader title="New recovery episode" subtitle="Enter the details your surgeon gave you to begin a new recovery." />

      {checking ? (
        <Panel><LoadingState label="Checking your recovery status…" /></Panel>
      ) : hasActiveCareEpisode ? (
        <Panel title="Active recovery episode">
          <EmptyState
            title={activeSurgeryName ? `You already have an active episode for ${activeSurgeryName}` : 'You already have an active episode'}
            subtitle="Finish it before starting a new one. Visit Home to see its progress."
            action={<Button variant="primary" onClick={() => navigate('/patient')}>Go to Home</Button>}
          />
        </Panel>
      ) : (
        <Panel title="Recovery episode details">
          <form onSubmit={submit} className="grid items-start gap-4 sm:grid-cols-2">
            <Field label="Doctor ID" required>
              <input
                className="field-input"
                value={form.doctorUniqueId}
                onChange={updateField('doctorUniqueId')}
                placeholder="e.g. DOC-3L4SUA"
                required
              />
            </Field>
            <Field label="Surgeon specialization" required>
              <select className="field-select" value={form.specialization} onChange={updateField('specialization')} required>
                <option value="" disabled>Select a specialization</option>
                {specializations.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </Field>
            <Field label="Type of surgery" required>
              <input
                className="field-input"
                value={form.surgeryName}
                onChange={updateField('surgeryName')}
                placeholder="e.g. Cardiac Bypass"
                required
              />
            </Field>
            <Field label="Date of surgery" required>
              <DatePicker
                id="new-episode-surgery-date"
                value={form.surgeryDate}
                onChange={(next) => setForm((prev) => ({ ...prev, surgeryDate: next }))}
                min={yearsAgoLocalDate(3)}
                max={todayLocalDate()}
                placeholder="Choose the date of surgery"
              />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" variant="primary" loading={submitting}>Start recovery episode</Button>
            </div>
          </form>
          {error ? (
            <div className="mt-3" role="alert" aria-live="assertive">
              <Alert variant="danger" title="Could not start episode">{error}</Alert>
            </div>
          ) : null}
        </Panel>
      )}
      </div>
    </PatientDashboardShell>
  );
}
