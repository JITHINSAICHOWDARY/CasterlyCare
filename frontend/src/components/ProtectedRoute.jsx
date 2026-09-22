import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { roleHome } from '../config/navigation';
import PageLoader from './PageLoader';

export default function ProtectedRoute({ role, roles }) {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) {
    return <PageLoader label="Restoring your secure session" />;
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
