import { useEffect, useMemo, useRef, useState } from 'react';
import PatientDashboardShell from '../../components/PatientDashboardShell';
import { patientService } from '../../api/services/patient';
import { API_BASE, apiErrorMessage, openSecureFile } from '../../api/client';
import { Alert, Badge, Button, EmptyState, Field, Panel, PageHeader, SectionHeading } from '../../components/ui';

// PHASE 2.6.5 — lab reports responsive and accessibility hardening

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatReportDate(value) {
  const date = safeDate(value);
  if (!date) return 'Date not recorded';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatReportDateTime(value) {
  const date = safeDate(value);
  if (!date) return 'Date not recorded';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function reportTypeLabel(value) {
  const normalized = String(value || 'document').toLowerCase();
  const labels = {
    pdf: 'PDF',
    jpg: 'JPG',
    jpeg: 'JPG',
    png: 'PNG',
    report: 'REPORT',
    document: 'DOCUMENT',
  };
  return labels[normalized] || normalized.toUpperCase();
}

function reportTypeKey(value) {
  const normalized = String(value || 'document').toLowerCase();
  if (normalized === 'jpeg') return 'jpg';
  if (['pdf', 'jpg', 'png', 'report', 'document'].includes(normalized)) return normalized;
  return 'other';
}

function formatFileSize(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function reportHref(fileUrl) {
  if (!fileUrl) return '';
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  return `${API_BASE}${fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`}`;
}

function isTrustedReportHref(href) {
  if (!href) return false;
  try {
    const url = new URL(href, window.location.origin);
    const apiUrl = new URL(API_BASE, window.location.origin);
    return url.origin === apiUrl.origin && url.pathname.startsWith('/uploads/patient_files/');
  } catch {
    return false;
  }
}

function normalizeReport(file = {}) {
  return {
    ...file,
    id: file.id || file.fileId || file._id,
    label: file.label || file.name || file.fileName || 'Medical document',
    fileType: file.fileType || file.mimeType || 'document',
    category: file.category || file.documentType || file.type || '',
    createdAt: file.createdAt || file.uploadedAt || file.created_at || null,
    fileSize: file.fileSize ?? file.size ?? null,
    description: file.description || file.notes || '',
    fileUrl: file.fileUrl || file.url || file.path || '',
  };
}

function uniqueTypes(files) {
  const seen = new Set();
  files.forEach((file) => seen.add(reportTypeKey(file.fileType)));
  return ['all', ...Array.from(seen).sort()];
}

// PHASE 2.6.4 — lab report filtering, sorting, and document metadata UX
export default function PatientLabReports() {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [files, setFiles] = useState([]);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [stepUpToken, setStepUpToken] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');
  const passwordRef = useRef(null);
  const feedbackRef = useRef(null);
  const vaultHeadingRef = useRef(null);

  const normalizedFiles = useMemo(() => files.map(normalizeReport), [files]);

  const reportTypes = useMemo(() => uniqueTypes(normalizedFiles), [normalizedFiles]);

  const filteredFiles = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const result = normalizedFiles.filter((file) => {
      const matchesType = typeFilter === 'all' || reportTypeKey(file.fileType) === typeFilter;
      if (!matchesType) return false;
      if (!query) return true;
      return [file.label, file.category, file.description, reportTypeLabel(file.fileType)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });

    return [...result].sort((a, b) => {
      const aTime = safeDate(a.createdAt)?.getTime() || 0;
      const bTime = safeDate(b.createdAt)?.getTime() || 0;
      if (sortOrder === 'oldest') return aTime - bTime;
      return bTime - aTime;
    });
  }, [normalizedFiles, searchTerm, sortOrder, typeFilter]);

  const reportCountLabel = useMemo(
    () => `${normalizedFiles.length} ${normalizedFiles.length === 1 ? 'document' : 'documents'}`,
    [normalizedFiles.length]
  );

  const filteredCountLabel = useMemo(
    () => `${filteredFiles.length} shown`,
    [filteredFiles.length]
  );

  useEffect(() => {
    if (!unlocked) passwordRef.current?.focus();
  }, [unlocked]);

  useEffect(() => {
    if (error) feedbackRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (typeFilter !== 'all' && !reportTypes.includes(typeFilter)) setTypeFilter('all');
  }, [reportTypes, typeFilter]);

  function clearFilters() {
    setSearchTerm('');
    setTypeFilter('all');
    setSortOrder('newest');
  }

  async function unlockReports(e) {
    e.preventDefault();
    setError('');
    if (!password.trim()) {
      setError('Enter your account password to continue.');
      passwordRef.current?.focus();
      return;
    }

    setBusy(true);
    try {
      const verifyRes = await patientService.verifyLabReports(password);
      const nextStepUpToken = verifyRes?.data?.stepUpToken;
      if (!nextStepUpToken) throw new Error('Lab-report verification did not return a valid access token.');

      const res = await patientService.getLabReports(nextStepUpToken);
      setStepUpToken(nextStepUpToken);
      setFiles(Array.isArray(res?.data?.files) ? res.data.files : []);
      setLastLoadedAt(new Date());
      setUnlocked(true);
      setPassword('');
      clearFilters();
      requestAnimationFrame(() => vaultHeadingRef.current?.focus());
    } catch (err) {
      const status = err?.response?.status;
      setError(
        status === 401 || status === 403
          ? 'The account password could not be verified. No report links were released. Please check your password and try again.'
          : err?.code === 'ECONNABORTED'
            ? 'The secure verification request timed out. Your report access was not changed. Please try again.'
            : err?.response?.data?.error || 'We could not complete secure verification. No report links were released. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function refreshReports() {
    setRefreshing(true);
    setError('');
    try {
      if (!stepUpToken) {
        setUnlocked(false);
        setFiles([]);
        setError('Your secure access session is no longer available. No report links can be opened until you verify your password again.');
        return;
      }
      const res = await patientService.getLabReports(stepUpToken);
      setFiles(Array.isArray(res?.data?.files) ? res.data.files : []);
      setLastLoadedAt(new Date());
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        setUnlocked(false);
        setFiles([]);
        setStepUpToken('');
        setError('Your secure access session has expired. The report list has been locked again. Re-enter your password to continue.');
      } else {
        setError(
          err?.code === 'ECONNABORTED'
            ? 'The secure refresh request timed out. Your last available report list is still shown.'
            : err?.response?.data?.error || 'We could not refresh your lab reports. Your last available report list is still shown.'
        );
      }
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <PatientDashboardShell>
      <PageHeader
        eyebrow="Private medical records"
        title="Lab Reports"
        subtitle="Your reports are protected by an additional password check before the secure document links are released."
      />

      {!unlocked ? (
        <Panel className="max-w-xl">
          <SectionHeading
            eyebrow="Step-up verification"
            title="Unlock your lab reports"
            description="Re-enter your CasterlyCare account password. This additional check protects sensitive medical documents even when your normal session is already signed in."
          />
          <form onSubmit={unlockReports} className="space-y-4 mt-5" aria-busy={busy}>
            <Field
              label="Account password"
              hint="Your password is verified by the secure account service. It is not displayed or stored on this page."
              required
            >
              <input
                ref={passwordRef}
                type="password"
                required
                autoComplete="current-password"
                className="field-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby="lab-reports-security-note"
              />
            </Field>
            <p id="lab-reports-security-note" className="text-xs text-[var(--color-text-soft)]">
              Access is temporary. Leaving this page or an expired secure session will require verification again.
            </p>
            {error ? (
              <div ref={feedbackRef} tabIndex={-1} className="focus:outline-none" role="alert" aria-live="assertive">
                <Alert variant="danger" title="Secure verification issue">{error}</Alert>
              </div>
            ) : null}
            <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={busy}>
              {busy ? 'Verifying securely…' : 'Unlock Lab Reports'}
            </Button>
          </form>
        </Panel>
      ) : (
        <div className="space-y-5">
          <Panel>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div ref={vaultHeadingRef} tabIndex={-1} className="focus:outline-none" aria-live="polite">
                <SectionHeading
                  eyebrow="Secure document vault"
                  title="Your reports"
                  description="Only documents returned after successful step-up verification are shown here."
                />
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-4" aria-label="Lab report summary">
                  <Badge variant="ink" aria-label={`Total lab reports: ${reportCountLabel}`}>{reportCountLabel}</Badge>
                  <span aria-live="polite"><Badge variant="neutral">{filteredCountLabel}</Badge></span>
                  {lastLoadedAt ? <span className="text-xs text-[var(--color-text-soft)]">Last checked {lastLoadedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span> : null}
                </div>
              </div>
              <Button type="button" variant="secondary" onClick={refreshReports} loading={refreshing}>
                Refresh reports
              </Button>
            </div>

            <div className="lab-reports-toolbar mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_11rem_11rem_auto]">
              <Field label="Search reports">
                <input
                  type="search"
                  inputMode="search"
                  enterKeyHint="search"
                  className="field-input"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by report name or category"
                  aria-label="Search lab reports"
                />
              </Field>
              <Field label="Document type">
                <select className="field-input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by document type">
                  {reportTypes.map((type) => (
                    <option key={type} value={type}>
                      {type === 'all' ? 'All types' : reportTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Sort by">
                <select className="field-input" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} aria-label="Sort lab reports">
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </Field>
              <div className="flex items-end">
                <Button type="button" variant="ghost" onClick={clearFilters} disabled={!searchTerm && typeFilter === 'all' && sortOrder === 'newest'} className="w-full md:w-auto" aria-label="Clear lab report search, filter, and sort options">
                  Clear
                </Button>
              </div>
            </div>
          </Panel>

          {error ? <Alert variant={unlocked ? 'warning' : 'danger'} title="Secure report access">{error}</Alert> : null}

          <Panel>
            <div className="mb-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-muted)] p-4" role="note">
              <p className="text-sm font-semibold text-[var(--color-ink)]">Secure access is active for this session</p>
              <p className="text-xs text-[var(--color-text-soft)] mt-1">Report links are issued only after successful password verification and expire when your secure access session expires.</p>
            </div>

            {normalizedFiles.length === 0 ? (
              <EmptyState
                title="No reports uploaded yet"
                subtitle="Your doctor can upload lab reports, scans, and discharge summaries to this secure vault."
              />
            ) : filteredFiles.length === 0 ? (
              <EmptyState
                title="No reports match your filters"
                subtitle="Try another search term or document type. Your secure report list is unchanged."
                action={<Button type="button" variant="secondary" onClick={clearFilters}>Clear filters</Button>}
              />
            ) : (
              <div className="space-y-3" aria-label="Lab reports list">
                {filteredFiles.map((file) => {
                  const isSecureFile = typeof file.fileUrl === 'string' && file.fileUrl.startsWith('/uploads/patient_files/');
                  const sizeLabel = formatFileSize(file.fileSize);
                  const categoryLabel = file.category ? String(file.category) : '';
                  const description = String(file.description || '').trim();
                  return (
                    <div key={file.id || `${file.label}-${file.createdAt}`} className="lab-report-card flex flex-col gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-start gap-2">
                          <p className="font-semibold text-sm text-[var(--color-ink)] break-words">{file.label}</p>
                          <Badge variant="neutral">Private</Badge>
                        </div>
                        <p className="text-xs text-[var(--color-text-soft)] mt-1">
                          Uploaded {formatReportDate(file.createdAt)}
                          {categoryLabel ? ` · ${categoryLabel}` : ''}
                        </p>
                        <p className="text-xs text-[var(--color-text-soft)] mt-1">
                          {reportTypeLabel(file.fileType)}{sizeLabel ? ` · ${sizeLabel}` : ''} · {formatReportDateTime(file.createdAt)}
                        </p>
                        {description ? <p className="text-xs text-[var(--color-text-soft)] mt-2 break-words">{description}</p> : null}
                        <p className="text-xs text-[var(--color-text-soft)] mt-1">Opens through the protected CasterlyCare document endpoint.</p>
                      </div>
                      <div className="lab-report-card__action flex items-center gap-3 shrink-0">
                        {isSecureFile ? (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await openSecureFile(file.fileUrl, stepUpToken ? { 'X-Step-Up-Token': stepUpToken } : {});
                              } catch (err) {
                                setError(apiErrorMessage(err) || 'Unable to open this report. Please try again.');
                              }
                            }}
                            className="btn btn-secondary btn-sm"
                            aria-label={`Open ${file.label} securely in a new tab`}
                            title="Opens in a new tab"
                          >
                            Open securely ↗
                          </button>
                        ) : (
                          <span className="text-xs text-[var(--color-text-soft)]" role="status">Secure link unavailable</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Alert variant="ink" title="Privacy reminder">
            These documents contain sensitive medical information. Use the secure link provided here and avoid saving or sharing copies on public or shared devices.
          </Alert>

          <div className="text-xs text-[var(--color-text-soft)]">
            Automated access controls protect the vault; they do not change the medical content of your records.
          </div>
        </div>
      )}
    </PatientDashboardShell>
  );
}
