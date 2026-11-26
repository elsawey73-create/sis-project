import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import useFetch from '../hooks/useFetch';
import { errorText } from '../utils/format';
import Brand from '../components/Brand';
import LanguageSwitcher from '../components/LanguageSwitcher';
import ThemeSwitcher from '../components/ThemeSwitcher';
import { Alert } from '../components/ui';
import Icon from './icons';
import QrScanner from './QrScanner';
import { isDetailPath, screenTitleKey } from './platform';

const TABS = {
  student: [
    { to: '/student', key: 'nav.home', icon: 'home', end: true },
    { to: '/student/schedule', key: 'nav.schedule', icon: 'calendar' },
    { to: '/student/grades', key: 'nav.grades', icon: 'grades' },
    { to: '/student/attendance', key: 'nav.attendance', icon: 'check', also: ['/attend'] },
  ],
  instructor: [
    { to: '/doctor', key: 'nav.myCourses', icon: 'book', end: true },
    { to: '/catalog', key: 'nav.catalog', icon: 'catalog' },
    { to: '/messages', key: 'nav.messages', icon: 'chat', badge: 'messages' },
    { to: '/notifications', key: 'nav.notifications', icon: 'bell', badge: 'notifications' },
  ],
  admin: [
    { to: '/admin', key: 'nav.dashboard', icon: 'home', end: true },
    { to: '/admin/catalog', key: 'nav.manageCatalog', icon: 'catalog' },
    { to: '/admin/offerings', key: 'nav.offerings', icon: 'calendar' },
    { to: '/admin/users', key: 'nav.users', icon: 'users' },
  ],
};

const MORE = {
  student: [
    ['/student/registration', 'nav.registration', 'book'],
    ['/student/transcript', 'nav.transcript', 'doc'],
    ['/catalog', 'nav.catalog', 'catalog'],
    ['/messages', 'nav.messages', 'chat'],
    ['/notifications', 'nav.notifications', 'bell'],
  ],
  instructor: [],
  admin: [
    ['/catalog', 'nav.catalog', 'catalog'],
    ['/notifications', 'nav.notifications', 'bell'],
  ],
};

function tabOn(tab, pathname) {
  if (tab.also?.includes(pathname)) return true;
  if (tab.end) return pathname === tab.to;
  return pathname === tab.to || pathname.startsWith(`${tab.to}/`);
}

export function NativeChrome() {
  const { preference } = useTheme();
  useEffect(() => {
    const nav = getComputedStyle(document.documentElement).getPropertyValue('--color-nav').trim();
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    if (nav) meta.setAttribute('content', nav);
    // Both themes keep a dark navigation chrome, so status icons stay light.
    SystemBars.setStyle({ style: SystemBarsStyle.Dark }).catch(() => {});
  }, [preference]);
  return null;
}

export default function NativeShell() {
  const { user, logout } = useAuth();
  const { t, pick } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [summary, setSummary] = useState({ notifications: 0, messages: 0 });
  const [more, setMore] = useState(false);
  const [sessions, setSessions] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [sheetPath, setSheetPath] = useState(location.pathname);
  if (sheetPath !== location.pathname) {
    setSheetPath(location.pathname);
    setMore(false);
    setSessions(false);
  }

  useEffect(() => {
    let alive = true;
    const load = () => api.get('/notifications/summary').then((response) => alive && setSummary(response.data)).catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [location.pathname]);

  useEffect(() => {
    const open = () => setScanning(true);
    window.addEventListener('unidex-open-scan', open);
    return () => window.removeEventListener('unidex-open-scan', open);
  }, []);

  const role = user.role;
  const tabs = TABS[role] || TABS.student;
  const moreLinks = MORE[role] || [];
  const moreActive = more || moreLinks.some(([to]) => tabOn({ to }, location.pathname));
  const title = t(screenTitleKey(location.pathname));
  const showBack = isDetailPath(location.pathname);
  const name = pick(user.full_name_ar, user.full_name_en);
  const dept = user.student
    ? pick(user.student.department_ar, user.student.department_en)
    : user.instructor
      ? pick(user.instructor.department_ar, user.instructor.department_en)
      : '';

  return (
    <div className="native-shell">
      <header className="native-topbar">
        {showBack ? (
          <button type="button" className="native-back" onClick={() => navigate(-1)} aria-label={t('native.back')}>
            <Icon name="back" />
          </button>
        ) : <Brand compact />}
        <h1 className="native-top-title">{title}</h1>
        <div className="native-top-actions">
          <ThemeSwitcher />
          <LanguageSwitcher />
        </div>
      </header>

      <main className="native-stage">
        <div key={location.pathname} className="native-page">
          <Outlet />
        </div>
      </main>

      {!scanning && (
        <NativeFab
          key={location.pathname}
          role={role}
          summary={summary}
          onScan={() => setScanning(true)}
          onSessions={() => setSessions(true)}
        />
      )}

      <nav className="native-tabbar" aria-label={t('nav.home')}>
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={() => `native-tab${tabOn(tab, location.pathname) ? ' active' : ''}`}
          >
            <span className="native-tab-icon">
              <Icon name={tab.icon} />
              {tab.badge && summary[tab.badge] > 0 && <span className="count">{summary[tab.badge]}</span>}
            </span>
            <span className="native-tab-label">{t(tab.key)}</span>
          </NavLink>
        ))}
        <button type="button" className={`native-tab${moreActive ? ' active' : ''}`} onClick={() => setMore(true)}>
          <span className="native-tab-icon"><Icon name="more" /></span>
          <span className="native-tab-label">{t('nav.more')}</span>
        </button>
      </nav>

      {more && (
        <Sheet title={t('nav.more')} onClose={() => setMore(false)}>
          <div className="native-profile">
            <div className="native-avatar" aria-hidden="true">{(name || 'U').trim().charAt(0)}</div>
            <div>
              <strong>{name}</strong>
              <div className="muted small">
                {t(`role.${user.role}`)}
                {user.student?.student_code ? ` · ${user.student.student_code}` : user.login_id ? ` · ${user.login_id}` : ''}
              </div>
              {dept && <div className="muted small">{dept}</div>}
            </div>
          </div>
          <div className="native-stack">
            {moreLinks.map(([to, key, icon]) => (
              <NavLink key={to} to={to} className="native-link-row" onClick={() => setMore(false)}>
                <Icon name={icon} />
                <span>{t(key)}</span>
                {key === 'nav.messages' && summary.messages > 0 && <span className="count">{summary.messages}</span>}
                {key === 'nav.notifications' && summary.notifications > 0 && <span className="count">{summary.notifications}</span>}
              </NavLink>
            ))}
          </div>
          <button type="button" className="btn" onClick={logout}>{t('nav.logout')}</button>
        </Sheet>
      )}

      {sessions && <SessionSheet onClose={() => setSessions(false)} />}
      {scanning && <QrScanner onClose={() => setScanning(false)} />}
    </div>
  );
}

function NativeFab({ role, summary, onScan, onSessions }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const go = (to) => () => navigate(to);
  const actions = role === 'instructor'
    ? [
        { key: 'nav.notifications', icon: 'bell', badge: summary.notifications, run: go('/notifications') },
        { key: 'nav.messages', icon: 'chat', badge: summary.messages, run: go('/messages') },
        { key: 'doc.startAtt', icon: 'qr', run: onSessions, primary: true },
      ]
    : role === 'admin'
      ? [
          { key: 'nav.notifications', icon: 'bell', badge: summary.notifications, run: go('/notifications') },
          { key: 'nav.manageCatalog', icon: 'catalog', run: go('/admin/catalog') },
          { key: 'nav.offerings', icon: 'calendar', run: go('/admin/offerings') },
          { key: 'nav.users', icon: 'users', run: go('/admin/users'), primary: true },
        ]
      : [
          { key: 'nav.notifications', icon: 'bell', badge: summary.notifications, run: go('/notifications') },
          { key: 'nav.messages', icon: 'chat', badge: summary.messages, run: go('/messages') },
          { key: 'nav.transcript', icon: 'doc', run: go('/student/transcript') },
          { key: 'nav.registration', icon: 'book', run: go('/student/registration') },
          { key: 'nav.scan', icon: 'qr', run: onScan, primary: true },
        ];

  return (
    <>
      {open && <button type="button" className="native-fab-scrim" aria-label={t('native.close')} onClick={() => setOpen(false)} />}
      <div className="native-fab-dock">
        {open && (
          <div className="native-fab-actions">
            {actions.map((action) => (
              <div key={action.key} className="native-fab-action">
                <span className="native-fab-label">{t(action.key)}</span>
                <button
                  type="button"
                  className={`native-fab-mini${action.primary ? ' is-primary' : ''}`}
                  onClick={() => { setOpen(false); action.run(); }}
                >
                  <Icon name={action.icon} />
                  {action.badge > 0 && <span className="count">{action.badge}</span>}
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          className={`native-fab${open ? ' is-open' : ''}`}
          aria-expanded={open}
          aria-label={open ? t('native.close') : t(role === 'admin' ? 'native.quick' : role === 'instructor' ? 'doc.startAtt' : 'nav.scan')}
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name={open ? 'close' : role === 'admin' ? 'bolt' : 'qr'} />
        </button>
      </div>
    </>
  );
}

function Sheet({ title, onClose, children }) {
  const { t } = useLanguage();
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <button type="button" className="native-backdrop" aria-label={t('native.close')} onClick={onClose} />
      <div className="native-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="native-grab" />
        <div className="row between">
          <h2 className="m0">{title}</h2>
          <button type="button" className="b b-ghost" onClick={onClose}>{t('native.close')}</button>
        </div>
        {children}
      </div>
    </>
  );
}

function SessionSheet({ onClose }) {
  const { t, pick } = useLanguage();
  const navigate = useNavigate();
  const offerings = useFetch('/instructor/offerings');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start(offering) {
    setBusy(true);
    setError('');
    try {
      const response = await api.post('/attendance/sessions', { offering_id: offering.id });
      onClose();
      navigate(`/doctor/attendance/${response.data.id}`);
    } catch (err) {
      setError(errorText(err, t));
      setBusy(false);
    }
  }

  return (
    <Sheet title={t('native.sessions')} onClose={onClose}>
      <Alert>{error}</Alert>
      {offerings.loading && <p className="muted">{t('common.loading')}</p>}
      {offerings.error && <Alert>{errorText(offerings.error, t)}</Alert>}
      <div className="native-stack">
        {(offerings.data || []).map((offering) => (
          <article key={offering.id} className="native-card">
            <div className="native-card-top">
              <div>
                <span className="native-code">{offering.code}</span>
                <strong>{pick(offering.name_ar, offering.name_en)}</strong>
              </div>
              {offering.open_session_id && <span className="tag tag-ok">{t('att.live')}</span>}
            </div>
            <button type="button" className="b b-primary" disabled={busy} onClick={() => start(offering)}>
              {offering.open_session_id ? t('doc.continueAtt') : t('doc.startAtt')}
            </button>
          </article>
        ))}
        {offerings.data && offerings.data.length === 0 && <p className="native-empty muted">{t('reg.none')}</p>}
      </div>
    </Sheet>
  );
}
