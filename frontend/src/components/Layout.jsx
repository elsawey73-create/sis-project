import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { motionMs } from '../utils/motion';
import { isNativeApp } from '../native/platform';
import NativeShell from '../native/NativeShell';
import Brand from './Brand';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeSwitcher from './ThemeSwitcher';
import QuickSearch from './QuickSearch';

const links = {
  student: [
    ['/student', 'nav.home', true], ['/student/registration', 'nav.registration'], ['/student/schedule', 'nav.schedule'],
    ['/student/grades', 'nav.grades'], ['/student/transcript', 'nav.transcript'], ['/student/attendance', 'nav.attendance'],
    ['/catalog', 'nav.catalog'], ['/calendar', 'nav.calendar'],
  ],
  instructor: [['/doctor', 'nav.myCourses', true], ['/catalog', 'nav.catalog'], ['/calendar', 'nav.calendar']],
  admin: [
    ['/admin', 'nav.dashboard', true], ['/admin/catalog', 'nav.manageCatalog'], ['/admin/offerings', 'nav.offerings'],
    ['/admin/users', 'nav.users'], ['/catalog', 'nav.catalog'], ['/calendar', 'nav.calendar'],
  ],
};

function NavItems({ items, onNavigate }) {
  return items.map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) => (isActive ? 'active' : undefined)}
    >
      {item.label}
      {item.count > 0 ? <span className="count">{item.count}</span> : null}
    </NavLink>
  ));
}

export default function Layout() {
  if (isNativeApp()) return <NativeShell />;
  return <WebLayout />;
}

function WebLayout() {
  const { user, logout } = useAuth();
  const { t, pick } = useLanguage();
  const location = useLocation();
  const [summary, setSummary] = useState({ notifications: 0, messages: 0 });
  const [menuPhase, setMenuPhase] = useState('closed');
  const menuButtonRef = useRef(null);
  const closeButtonRef = useRef(null);
  const restoreFocus = useRef(false);
  const stageRef = useRef(null);
  const skipReplay = useRef(true);
  const pathRef = useRef(location.pathname);

  // Notification and message counts. Refresh every 30 seconds and on navigation.
  useEffect(() => {
    let alive = true;
    const load = () => api.get('/notifications/summary').then((r) => alive && setSummary(r.data)).catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [location.pathname]);

  useEffect(() => {
    if (pathRef.current === location.pathname) return undefined;
    pathRef.current = location.pathname;
    const id = requestAnimationFrame(() => setMenuPhase('closed'));
    return () => cancelAnimationFrame(id);
  }, [location.pathname]);

  // Replay the entrance animation on navigation without remounting the page.
  useEffect(() => {
    if (skipReplay.current) {
      skipReplay.current = false;
      return undefined;
    }
    const node = stageRef.current;
    if (!node) return undefined;
    node.classList.remove('is-entering');
    const id = requestAnimationFrame(() => node.classList.add('is-entering'));
    return () => cancelAnimationFrame(id);
  }, [location.pathname]);

  useEffect(() => {
    if (menuPhase !== 'entering') return undefined;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setMenuPhase('open'));
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner) cancelAnimationFrame(inner);
    };
  }, [menuPhase]);

  useEffect(() => {
    if (menuPhase !== 'leaving') return undefined;
    const timer = window.setTimeout(() => setMenuPhase('closed'), motionMs(240));
    return () => clearTimeout(timer);
  }, [menuPhase]);

  const menuVisible = menuPhase !== 'closed';

  useEffect(() => {
    if (!menuVisible) {
      if (restoreFocus.current) {
        restoreFocus.current = false;
        menuButtonRef.current?.focus();
      }
      return undefined;
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        restoreFocus.current = true;
        setMenuPhase('leaving');
      }
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [menuVisible]);

  useEffect(() => {
    if (menuPhase === 'open') closeButtonRef.current?.focus();
  }, [menuPhase]);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 761px)');
    const onChange = () => { if (query.matches) setMenuPhase('closed'); };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const canMessage = user.role !== 'admin';
  const items = [
    ...links[user.role].map(([to, key, end]) => ({ to, end: !!end, label: t(key) })),
    ...(canMessage ? [{ to: '/messages', label: t('nav.messages'), count: summary.messages }] : []),
  ];

  function openMenu() {
    setMenuPhase('entering');
  }

  function closeMenu(shouldRestore) {
    restoreFocus.current = shouldRestore;
    setMenuPhase((phase) => (phase === 'closed' ? 'closed' : 'leaving'));
  }

  return (
    <div className="app-shell">
      <div className="app-top no-print" inert={menuVisible ? true : undefined}>
        <header className="navbar">
          <div className="navbar-start">
            <button
              ref={menuButtonRef}
              type="button"
              className="nav-toggle"
              aria-expanded={menuPhase === 'open' || menuPhase === 'entering'}
              aria-controls="app-drawer"
              onClick={openMenu}
            >
              <span className="nav-toggle-bars" aria-hidden="true" />
              <span className="sr-only">{t('nav.menu')}</span>
            </button>
            <Brand />
          </div>
          <div className="navbar-user">
            <QuickSearch />
            <ThemeSwitcher />
            <LanguageSwitcher />
            <NavLink to="/notifications" className="icon-link" title={t('nav.notifications')}>
              <span aria-hidden="true">🔔</span>
              <span className="sr-only">{t('nav.notifications')}</span>
              {summary.notifications > 0 && <span className="count count-float">{summary.notifications}</span>}
            </NavLink>
            <span className="user-name">{pick(user.full_name_ar, user.full_name_en)}</span>
            <span className="badge">{t('role.' + user.role)}</span>
            <button className="btn-small" onClick={logout}>{t('nav.logout')}</button>
          </div>
        </header>
        <nav className="nav" aria-label={t('nav.menu')}>
          <NavItems items={items} />
        </nav>
      </div>

      {menuVisible && (
        <div className={`drawer-root no-print${menuPhase === 'open' ? ' is-open' : ''}`}>
          <div className="drawer-backdrop" onClick={() => closeMenu(true)} />
          <nav id="app-drawer" className="drawer" aria-label={t('nav.menu')}>
            <div className="drawer-head">
              <strong>{t('nav.menu')}</strong>
              <button ref={closeButtonRef} type="button" className="drawer-close" onClick={() => closeMenu(true)} aria-label={t('nav.closeMenu')}>
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <div className="nav drawer-nav">
              <NavItems items={items} onNavigate={() => closeMenu(false)} />
            </div>
            <button type="button" className="drawer-logout" onClick={logout}>{t('nav.logout')}</button>
          </nav>
        </div>
      )}

      <main className="container" inert={menuVisible ? true : undefined}>
        <div ref={stageRef} className="page-stage is-entering">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
