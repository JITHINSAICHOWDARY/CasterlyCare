import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { roleHome } from '../config/navigation';

export default function ProtectedRoute({ role, roles }) {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-parchment)] px-6 text-center text-[var(--color-text-soft)]" role="status" aria-live="polite">
        <div>
          <p className="font-display text-xl text-[var(--color-ink)]">Restoring your secure session</p>
          <p className="mt-1 text-sm">Please wait while CasterlyCare verifies your access.</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  const allowedRoles = roles || (role ? [role] : []);
  if (allowedRoles.length && !allowedRoles.includes(user.role)) {
    return <Navigate to={roleHome[user.role] || '/login'} replace />;
  }

  return <Outlet />;
}
