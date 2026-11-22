import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { AuthProvider, useAuth, homeByRole } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import StudentHome from './pages/student/StudentHome';
import Registration from './pages/student/Registration';
import Schedule from './pages/student/Schedule';
import Grades from './pages/student/Grades';
import Transcript from './pages/student/Transcript';
import Attendance from './pages/student/Attendance';
import Attend from './pages/student/Attend';
import DoctorHome from './pages/doctor/DoctorHome';
import OfferingRoster from './pages/doctor/OfferingRoster';
import AttendanceSession from './pages/doctor/AttendanceSession';
import AdminHome from './pages/admin/AdminHome';
import AdminCatalog from './pages/admin/AdminCatalog';
import AdminOfferings from './pages/admin/AdminOfferings';
import AdminUsers from './pages/admin/AdminUsers';
import Catalog from './pages/shared/Catalog';
import Messages from './pages/shared/Messages';
import Notifications from './pages/shared/Notifications';

// "/" يوجّه كل واحد لصفحته حسب دوره
function RootRedirect() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  if (loading) return <div className="center">{t('common.loading')}</div>;
  return <Navigate to={user ? homeByRole[user.role] : '/login'} replace />;
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<Login />} />

            {/* أي مستخدم مسجّل */}
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/catalog" element={<Catalog />} />
                <Route path="/notifications" element={<Notifications />} />
              </Route>
            </Route>

            <Route element={<ProtectedRoute roles={['student', 'instructor']} />}>
              <Route element={<Layout />}>
                <Route path="/messages" element={<Messages />} />
                <Route path="/messages/:id" element={<Messages />} />
              </Route>
            </Route>

            <Route element={<ProtectedRoute roles={['student']} />}>
              <Route element={<Layout />}>
                <Route path="/student" element={<StudentHome />} />
                <Route path="/student/registration" element={<Registration />} />
                <Route path="/student/schedule" element={<Schedule />} />
                <Route path="/student/grades" element={<Grades />} />
                <Route path="/student/transcript" element={<Transcript />} />
                <Route path="/student/attendance" element={<Attendance />} />
                <Route path="/attend" element={<Attend />} />
              </Route>
            </Route>

            <Route element={<ProtectedRoute roles={['instructor']} />}>
              <Route element={<Layout />}>
                <Route path="/doctor" element={<DoctorHome />} />
                <Route path="/doctor/offerings/:id" element={<OfferingRoster />} />
                <Route path="/doctor/attendance/:id" element={<AttendanceSession />} />
              </Route>
            </Route>

            <Route element={<ProtectedRoute roles={['admin']} />}>
              <Route element={<Layout />}>
                <Route path="/admin" element={<AdminHome />} />
                <Route path="/admin/catalog" element={<AdminCatalog />} />
                <Route path="/admin/offerings" element={<AdminOfferings />} />
                <Route path="/admin/users" element={<AdminUsers />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}
