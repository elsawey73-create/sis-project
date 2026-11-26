import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth, homeByRole } from '../context/AuthContext';
import { ScreenLoading } from './ui';

// roles: who may enter. Example: ['admin']. Omit it to allow any signed-in user.
export default function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <ScreenLoading />;
  // Remember the requested page, including the QR query, and return there after login.
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeByRole[user.role]} replace />;
  return <Outlet />;
}
