import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../api/client';
import { navigationByRole, roleLabels } from '../config/navigation';
import PatientChatWidget from './PatientChatWidget';
import { IconButton } from './ui';
import { useRealtime } from '../context/RealtimeContext';

export default function DashboardShell({ role, children, withPatientChat = false }) {
  const { user, logout } = useAuth();
  const { status: realtimeStatus, isOnline: realtimeOnline, reconnectAttempts } = useRealtime();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItems = navigationByRole[role] || [];
  const roleLabel = roleLabels[role] || 'Member';
  const currentItem = navItems.find((item) => item.to === location.pathname || (item.to !== `/${role}` && location.pathname.startsWith(`${item.to}/`)));

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const navigation = (
    <nav className="flex-1 space-y-1 overflow-y-auto" aria-label={`${roleLabel} navigation`}>
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        >
          <span className="w-4 text-center" aria-hidden="true">{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen flex bg-[var(--color-parchment)]">
      <a className="skip-link" href="#dashboard-main">Skip to main content</a>
      <aside className="hidden lg:flex w-64 shrink-0 ink-sidebar flex-col p-4">
        <BrandMark roleLabel={roleLabel} />
        {navigation}
        <SidebarAccount user={user} apiBase={API_BASE} onLogout={handleLogout} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
          <button className="absolute inset-0 bg-black/50" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-[min(20rem,88vw)] ink-sidebar flex flex-col p-4 shadow-2xl" aria-label={`${roleLabel} mobile navigation`}>
            <BrandMark roleLabel={roleLabel} />
            {navigation}
            <SidebarAccount user={user} apiBase={API_BASE} onLogout={handleLogout} />
          </aside>
        </div>
      ) : null}

      <main id="dashboard-main" tabIndex="-1" className="flex-1 min-w-0 overflow-y-auto">
        {realtimeStatus !== 'connected' ? (
          <div className="realtime-shell-notice" role="status" aria-live="polite">
            <span className="realtime-shell-notice-dot" aria-hidden="true" />
            <span>{realtimeOnline === false ? 'Internet connection is offline.' : realtimeStatus === 'reconnecting' ? `Live updates reconnecting${reconnectAttempts ? ` · attempt ${reconnectAttempts}` : '…'}.` : 'Live updates are connecting…'}</span>
            <span className="realtime-shell-notice-muted">Secure REST actions remain available.</span>
          </div>
        ) : null}

        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-parchment)]/95 backdrop-blur px-4 py-3 lg:hidden mobile-shell-bar">
          <IconButton label="Open navigation" onClick={() => setMobileOpen(true)} className="bg-white border border-[var(--color-line)]">☰</IconButton>
          <div className="min-w-0">
            <p className="font-display text-lg text-[var(--color-ink)] truncate">CasterlyCare</p>
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-gold)]">{roleLabel}</p>
          </div>
          {currentItem ? <span className="ml-auto text-xs text-[var(--color-text-soft)] truncate max-w-[8rem]">{currentItem.label}</span> : null}
        </div>
        <div className="max-w-6xl mx-auto p-5 sm:p-6 lg:p-8">{children}</div>
      </main>

      {withPatientChat ? <PatientChatWidget /> : null}
    </div>
  );
}

function BrandMark({ roleLabel }) {
  return (
    <div className="flex items-center gap-2.5 px-2 py-3 mb-4">
      <SealMark />
      <div className="min-w-0">
        <p className="font-display text-white text-lg leading-none">CasterlyCare</p>
        <p className="text-[10px] uppercase tracking-wider text-[var(--color-gold-light)] mt-1">{roleLabel}</p>
      </div>
    </div>
  );
}

function SidebarAccount({ user, apiBase, onLogout }) {
  return (
    <div className="border-t border-white/10 pt-3 mt-3 sidebar-account">
      <div className="flex items-center gap-2.5 px-2 mb-2">
        {user?.photoUrl ? (
          <img src={`${apiBase}${user.photoUrl}`} alt="" className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-[var(--color-crimson)] flex items-center justify-center text-white text-xs font-semibold" aria-hidden="true">
            {user?.name?.[0] || '?'}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm text-white truncate">{user?.name}</p>
          <p className="text-xs text-white/40 truncate">{user?.email}</p>
        </div>
      </div>
      <button type="button" onClick={onLogout} className="sidebar-link w-full text-left">
        <span className="w-4 text-center" aria-hidden="true">&#8592;</span> Log out
      </button>
    </div>
  );
}

function SealMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <circle cx="17" cy="17" r="16" stroke="var(--color-gold-light)" strokeWidth="1.5" />
      <circle cx="17" cy="17" r="11" fill="none" stroke="var(--color-gold-light)" strokeWidth="1" />
      <path d="M17 9 L20 16 L27 17 L20 18 L17 25 L14 18 L7 17 L14 16 Z" fill="var(--color-gold-light)" />
    </svg>
  );
}
