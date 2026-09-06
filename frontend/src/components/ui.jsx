export function PageHeader({ eyebrow, title, subtitle, action }) {
  return (
    <header className="page-header mb-6">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow text-[var(--color-gold)] mb-1">{eyebrow}</p> : null}
        <h1 className="font-display text-3xl lg:text-4xl text-[var(--color-ink)] leading-tight">{title}</h1>
        {subtitle ? <p className="text-sm text-[var(--color-text-soft)] mt-1.5 max-w-3xl">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function SectionHeading({ title, subtitle, action }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h2 className="font-display text-xl text-[var(--color-ink)]">{title}</h2>
        {subtitle ? <p className="text-sm text-[var(--color-text-soft)] mt-1">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Panel({ title, subtitle, action, children, className = '', interactive = false }) {
  return (
    <section className={`panel p-5 ${interactive ? 'panel-hover' : ''} ${className}`}>
      {(title || subtitle || action) && (
        <SectionHeading title={title} subtitle={subtitle} action={action} />
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, detail, accent = 'crimson', icon, trend, className = '' }) {
  const colorMap = {
    crimson: 'var(--color-crimson)',
    gold: 'var(--color-gold)',
    forest: 'var(--color-forest)',
    danger: 'var(--color-danger)',
  };
  return (
    <article className={`stat-card panel p-5 ${className}`}>
      <div className="stat-card-top">
        <p className="table-heading text-[var(--color-text-soft)]">{label}</p>
        {icon ? <span className="stat-card-icon" aria-hidden="true">{icon}</span> : null}
      </div>
      <div className="stat-card-main">
        <p className="font-display text-4xl leading-none" style={{ color: colorMap[accent] || colorMap.crimson }}>{value}</p>
        {trend ? <span className="stat-card-trend">{trend}</span> : null}
      </div>
      {detail ? <p className="text-xs text-[var(--color-muted)] mt-2">{detail}</p> : null}
    </article>
  );
}

export function Badge({ children, variant = 'ink', className = '' }) {
  return <span className={`badge badge-${variant} ${className}`}>{children}</span>;
}

export function StatusIndicator({ status, label, detail, className = '' }) {
  const map = {
    info: 'info',
    success: 'success',
    warning: 'warning',
    critical: 'critical',
    monitoring: 'monitoring',
    caution: 'caution',
    review: 'review',
  };
  const tone = map[status] || 'neutral';
  return (
    <div className={`status-indicator status-${tone} ${className}`} role="status">
      <span className="status-indicator-dot" aria-hidden="true" />
      <span className="status-indicator-copy">
        {label ? <strong>{label}</strong> : null}
        {detail ? <span>{detail}</span> : null}
      </span>
    </div>
  );
}

export function Button({ children, variant = 'primary', size = 'md', className = '', loading = false, disabled, ...props }) {
  const sizeClass = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '';
  return (
    <button
      className={`btn btn-${variant} ${sizeClass} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="h-3.5 w-3.5" /> : null}
      {children}
    </button>
  );
}

export function IconButton({ label, children, className = '', ...props }) {
  return (
    <button type="button" aria-label={label} title={label} className={`icon-btn ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Field({ label, hint, error, required = false, children }) {
  return (
    <div className="form-control-group">
      {label ? <label className="field-label">{label}{required ? <span aria-hidden="true"> *</span> : null}</label> : null}
      {children}
      {error ? <p className="form-error" role="alert">{error}</p> : hint ? <p className="form-help">{hint}</p> : null}
    </div>
  );
}

export function FormGrid({ children, columns = 2, className = '' }) {
  const gridClass = columns === 1 ? 'grid-cols-1' : columns === 3 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2';
  return <div className={`grid ${gridClass} gap-4 ${className}`}>{children}</div>;
}

export function Alert({ children, variant = 'ink', title }) {
  const styles = {
    ink: 'bg-[var(--color-parchment-deep)] text-[var(--color-ink)] border-[var(--color-line)]',
    danger: 'status-surface-critical text-[var(--color-danger)] border-[var(--color-danger)]',
    success: 'status-surface-success text-[var(--color-forest)] border-[var(--color-forest)]',
    warning: 'status-surface-warning text-[var(--color-amber)] border-[var(--color-amber)]',
  };
  return (
    <div className={`text-sm rounded-md border px-3.5 py-2.5 ${styles[variant] || styles.ink}`} role="status">
      {title ? <p className="font-semibold mb-0.5">{title}</p> : null}
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ title, subtitle, action }) {
  return (
    <div className="text-center py-10 px-4">
      <p className="font-display text-lg text-[var(--color-ink)]">{title}</p>
      {subtitle ? <p className="text-sm text-[var(--color-text-soft)] mt-1 max-w-md mx-auto">{subtitle}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-sm text-[var(--color-text-soft)]" role="status" aria-live="polite">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function Spinner({ className = '' }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent h-4 w-4 ${className}`} aria-hidden="true" />;
}

export function DataTable({ columns, rows, rowKey, empty, caption, compact = false, stickyHeader = false }) {
  return (
    <div className={`table-shell ${compact ? 'table-compact' : ''} ${stickyHeader ? 'table-sticky-header' : ''}`}>
      {caption ? <div className="table-caption">{caption}</div> : null}
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>{empty || <EmptyState title="No records found" />}</td>
            </tr>
          ) : rows.map((row, index) => (
            <tr key={rowKey ? rowKey(row, index) : index}>
              {columns.map((column) => (
                <td key={column.key}>
                  {column.render ? column.render(row, index) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Alarm-style time picker: hour / minute / AM-PM dropdowns instead of free text
export function AlarmTimePicker({ value, onChange }) {
  const [h, m, period] = parseTime(value);
  const set = (nh, nm, np) => onChange(formatTime(nh, nm, np));
  return (
    <div className="flex gap-2">
      <select className="field-select" value={h} onChange={(e) => set(e.target.value, m, period)} aria-label="Hour">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <select className="field-select" value={m} onChange={(e) => set(h, e.target.value, period)} aria-label="Minute">
        {['00', '15', '30', '45'].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <select className="field-select" value={period} onChange={(e) => set(h, m, e.target.value)} aria-label="AM or PM">
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

function parseTime(value) {
  if (!value) return [8, '00', 'AM'];
  const [time, period] = String(value).split(' ');
  const [h, m] = time.split(':');
  return [Number(h), m || '00', period || 'AM'];
}

function formatTime(h, m, period) {
  return `${h}:${m} ${period}`;
}

export function RecoveryDonut({ totalDays, daysRemaining, size = 160 }) {
  const safeTotal = Math.max(0, Number(totalDays) || 0);
  const safeRemaining = Math.max(0, Math.min(Number(daysRemaining) || 0, safeTotal));
  const daysDone = Math.max(0, safeTotal - safeRemaining);
  const pct = safeTotal > 0 ? daysDone / safeTotal : 0;
  const radius = size / 2 - 14;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * pct;
  return (
    <div className="flex flex-col items-center" aria-label={`${safeRemaining} recovery days remaining`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-parchment-deep)" strokeWidth="14" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-crimson)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${dash} ${circumference - dash}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <text x="50%" y="47%" textAnchor="middle" className="font-display" fontSize="28" fill="var(--color-ink)">{safeRemaining}</text>
        <text x="50%" y="63%" textAnchor="middle" fontSize="11" fill="var(--color-text-soft)">days left</text>
      </svg>
    </div>
  );
}

export function ConfirmModal({ open, title, body, confirmLabel = 'Confirm', onConfirm, onCancel, variant = 'danger', eyebrow, tone = 'danger', confirmDisabled = false }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}>
      <div className={`modal-card modal-narrow ${tone === 'danger' ? 'modal-danger' : ''}`} data-tone={tone} role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <div className="modal-header">
          <div className="modal-header-copy">
            {eyebrow ? <p className="modal-eyebrow">{eyebrow}</p> : null}
            <h3 id="confirm-modal-title" className="modal-title">{title}</h3>
          </div>
          <IconButton label="Close dialog" className="modal-icon-btn" onClick={onCancel}>×</IconButton>
        </div>
        <div className="modal-body">
          <div className="confirm-dialog-copy">
            <span className="confirm-dialog-icon" aria-hidden="true">{tone === 'danger' ? '!' : 'i'}</span>
            <p className="modal-description m-0">{body}</p>
          </div>
        </div>
        <div className="modal-footer">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant={variant} onClick={onConfirm} disabled={confirmDisabled}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

export function Modal({ open, title, onClose, children, width = 'max-w-md', eyebrow, description, footer, tone }) {
  if (!open) return null;
  const widthClass = width === 'max-w-2xl' ? 'modal-wide' : width === 'max-w-sm' ? 'modal-narrow' : '';
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal-card ${widthClass}`} data-tone={tone || undefined} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-header">
          <div className="modal-header-copy">
            {eyebrow ? <p className="modal-eyebrow">{eyebrow}</p> : null}
            <h3 id="modal-title" className="modal-title">{title}</h3>
            {description ? <p className="modal-description">{description}</p> : null}
          </div>
          <IconButton label="Close dialog" className="modal-icon-btn" onClick={onClose}>×</IconButton>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

