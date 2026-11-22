import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import Brand from './Brand';
import LanguageSwitcher from './LanguageSwitcher';

const links = {
  student: [
    ['/student', 'nav.home', true], ['/student/registration', 'nav.registration'], ['/student/schedule', 'nav.schedule'],
    ['/student/grades', 'nav.grades'], ['/student/transcript', 'nav.transcript'], ['/student/attendance', 'nav.attendance'],
    ['/catalog', 'nav.catalog'],
  ],
  instructor: [['/doctor', 'nav.myCourses', true], ['/catalog', 'nav.catalog']],
  admin: [
    ['/admin', 'nav.dashboard', true], ['/admin/catalog', 'nav.manageCatalog'], ['/admin/offerings', 'nav.offerings'],
    ['/admin/users', 'nav.users'], ['/catalog', 'nav.catalog'],
  ],
};

export default function Layout() {
  const { user, logout } = useAuth();
  const { t, pick } = useLanguage();
  const location = useLocation();
  const [summary, setSummary] = useState({ notifications: 0, messages: 0 });

  // عدّاد الإشعارات والرسائل (يتحدث كل 30 ثانية وعند تغيير الصفحة)
  useEffect(() => {
    let alive = true;
    const load = () => api.get('/notifications/summary').then((r) => alive && setSummary(r.data)).catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [location.pathname]);

  const canMessage = user.role !== 'admin';

  return (
    <div>
      <header className="navbar no-print">
        <Brand />
        <div className="navbar-user">
          <LanguageSwitcher />
          <NavLink to="/notifications" className="icon-link" title={t('nav.notifications')}>
            🔔{summary.notifications > 0 && <span className="count">{summary.notifications}</span>}
          </NavLink>
          <span>{pick(user.full_name_ar, user.full_name_en)}</span>
          <span className="badge">{t('role.' + user.role)}</span>
          <button className="btn-small" onClick={logout}>{t('nav.logout')}</button>
        </div>
      </header>
      <nav className="nav no-print">
        {links[user.role].map(([to, key, end]) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>{t(key)}</NavLink>
        ))}
        {canMessage && (
          <NavLink to="/messages" className={({ isActive }) => (isActive ? 'active' : '')}>
            {t('nav.messages')}{summary.messages > 0 && <span className="count">{summary.messages}</span>}
          </NavLink>
        )}
      </nav>
      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}
