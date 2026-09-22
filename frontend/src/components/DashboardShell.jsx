import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../api/client';
import { navigationByRole, roleLabels } from '../config/navigation';
import PatientChatWidget from './PatientChatWidget';
import NavIcon from './NavIcon';
import useInboxBadge from './useInboxBadge';
import LegalFooter from './LegalFooter';
import { ConfirmModal, IconButton } from './ui';
import lionMark from '../assets/lion-mark.png';

const COLLAPSED_KEY = 'lc_sidebar_collapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export default function DashboardShell({ role, children, withPatientChat = false }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const inboxCount = useInboxBadge(role === 'doctor');
  const navItems = navigationByRole[role] || [];
  const roleLabel = roleLabels[role] || 'Member';
  const currentItem = navItems.find((item) => item.to === location.pathname || (item.to !== `/${role}` && location.pathname.startsWith(`${item.to}/`)));

  function handleLogout() {
    setConfirmLogout(false);
    setMobileOpen(false);
    logout();
    navigate('/login', { replace: true });
  }

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // Persisting the preference is a nicety; the toggle still works without it.
      }
      return next;
    });
  }

  // `compact` = the desktop icon rail. The mobile drawer is always full width.
  const renderNavigation = (compact) => (
    <nav className="flex-1 space-y-1 overflow-y-auto" aria-label={`${roleLabel} navigation`}>
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => setMobileOpen(false)}
          title={compact ? item.label : undefined}
          aria-label={compact ? item.label : undefined}
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        >
          <span className="sidebar-link-icon"><NavIcon name={item.icon} /></span>
          <span className="sidebar-label">{item.label}</span>
          {item.to === '/doctor/inbox' && inboxCount > 0 ? (
            <>
              <span className="nav-badge" aria-hidden="true">{inboxCount > 99 ? '99+' : inboxCount}</span>
              <span className="sr-only">{inboxCount} awaiting reply</span>
            </>
          ) : null}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen flex bg-[var(--color-parchment)]" data-role={role} data-rail={collapsed ? 'collapsed' : 'open'}>
      <a className="skip-link" href="#dashboard-main">Skip to main content</a>
      <aside
        id="app-sidebar"
        data-collapsed={collapsed}
        className="shell-sidebar hidden lg:flex shrink-0 ink-sidebar flex-col p-4 lg:sticky lg:top-0 lg:h-screen"
      >
        <BrandMark roleLabel={roleLabel} collapsed={collapsed} onToggle={toggleCollapsed} />
        {renderNavigation(collapsed)}
        <SidebarAccount user={user} apiBase={API_BASE} onLogout={() => setConfirmLogout(true)} compact={collapsed} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
          <button className="absolute inset-0 bg-black/50" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-[min(20rem,88vw)] ink-sidebar flex flex-col p-4 shadow-2xl" aria-label={`${roleLabel} mobile navigation`}>
            <BrandMark roleLabel={roleLabel} />
            {renderNavigation(false)}
            <SidebarAccount user={user} apiBase={API_BASE} onLogout={() => setConfirmLogout(true)} />
          </aside>
        </div>
      ) : null}

      <main id="dashboard-main" tabIndex="-1" className="flex-1 min-w-0 overflow-y-auto">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-parchment)]/95 backdrop-blur px-4 py-3 lg:hidden mobile-shell-bar">
          <IconButton label="Open navigation" onClick={() => setMobileOpen(true)} className="bg-white border border-[var(--color-line)]"><NavIcon name="menu" /></IconButton>
          <img src={lionMark} alt="" className="h-7 w-auto" aria-hidden="true" />
          <div className="min-w-0">
            <p className="mobile-shell-brand font-display text-lg text-[var(--color-ink)]">CasterlyCare</p>
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-soft)]">{roleLabel}</p>
          </div>
          {currentItem ? <span className="ml-auto hidden text-xs text-[var(--color-text-soft)] truncate max-w-[8rem] sm:inline">{currentItem.label}</span> : null}
        </div>
        <div className="max-w-6xl mx-auto p-5 sm:p-6 lg:p-8">
          {children}
          {location.pathname === `/${role}` ? <LegalFooter /> : null}
        </div>
      </main>

      <ConfirmModal
        open={confirmLogout}
        tone="info"
        variant="primary"
        eyebrow="Sign out"
        title="Log out of CasterlyCare?"
        body="You'll need to sign in again to get back to your dashboard."
        confirmLabel="Yes, log out"
        onConfirm={handleLogout}
        onCancel={() => setConfirmLogout(false)}
      />

      {withPatientChat ? <PatientChatWidget /> : null}
    </div>
  );
}

function BrandMark({ roleLabel, collapsed, onToggle }) {
  const content = (
    <>
      <img src={lionMark} alt="" className="sidebar-brand-logo" aria-hidden="true" />
      <div className="sidebar-label min-w-0">
        <p className="sidebar-brand-name font-display">
          Casterly<span className="sidebar-brand-accent">Care</span>
        </p>
        <p className="sidebar-brand-role">{roleLabel}</p>
      </div>
    </>
  );
  // On desktop the logo itself is the sidebar toggle; the mobile drawer just shows it.
  if (!onToggle) return <div className="sidebar-brand">{content}</div>;
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  return (
    <button
      type="button"
      className="sidebar-brand sidebar-brand-toggle"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-controls="app-sidebar"
      aria-label={label}
      title={label}
    >
      {content}
    </button>
  );
}

function SidebarAccount({ user, apiBase, onLogout, compact = false }) {
  return (
    <div className="sidebar-account">
      <div className="sidebar-account-row">
        {user?.photoUrl ? (
          <img src={`${apiBase}${user.photoUrl}`} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-8 h-8 shrink-0 rounded-full bg-[var(--color-crimson)] flex items-center justify-center text-white text-xs font-semibold" aria-hidden="true">
            {user?.name?.[0] || '?'}
          </div>
        )}
        <div className="sidebar-label min-w-0">
          <p className="sidebar-account-name truncate">{user?.name}</p>
          <p className="sidebar-account-email truncate">{user?.email}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onLogout}
        className="sidebar-link w-full text-left"
        title={compact ? 'Log out' : undefined}
        aria-label={compact ? 'Log out' : undefined}
      >
        <span className="sidebar-link-icon"><NavIcon name="logout" /></span>
        <span className="sidebar-label">Log out</span>
      </button>
    </div>
  );
}
