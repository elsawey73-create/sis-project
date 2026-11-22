import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth, homeByRole } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

// roles: الأدوار المسموح لها بالدخول، مثال: ['admin']
export default function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  if (loading) return <div className="center">{t('common.loading')}</div>;
  // بنحفظ الصفحة اللي كان رايحلها (مهم للـ QR) ونرجّعه ليها بعد الدخول
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeByRole[user.role]} replace />;
  return <Outlet />;
}
