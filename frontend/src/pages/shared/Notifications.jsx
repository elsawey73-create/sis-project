import { Link } from 'react-router-dom';
import { useState } from 'react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import { LoadError, Loading } from '../../components/ui';
import { isNativeApp } from '../../native/platform';

const PREF_KEYS = ['grades_published', 'message', 'marked_absent', 'absence_warning', 'announcement', 'exam_reminder', 'registration_open'];

function textFor(n, t, pick) {
  const data = n.data || {};
  if (n.type === 'message') return `${t('notif.message')} ${pick(data.from_ar, data.from_en)}`;
  if (n.type === 'grades_published') return `${t('notif.grades')} ${data.course_code} — ${pick(data.course_ar, data.course_en)}`;
  if (n.type === 'marked_absent') return `${t('notif.absent')} ${data.course_code}`;
  if (n.type === 'absence_warning') return `${t('notif.absenceWarning')} ${data.course_code} (${data.absent_pct}%)`;
  if (n.type === 'announcement') return `${t('notif.announcement')} ${data.course_code}: ${data.title || ''}`;
  if (n.type === 'exam_reminder') return `${t('notif.exam')}: ${data.course_code} ${data.title || ''}`;
  if (n.type === 'registration_open') return `${t('notif.registration')} — ${pick(data.semester_ar, data.semester_en)}`;
  return n.type;
}

export default function Notifications() {
  const { user } = useAuth();
  const { t, pick } = useLanguage();
  const { data, error, loading, reload } = useFetch('/notifications');
  const prefs = useFetch('/notifications/preferences');
  const [saving, setSaving] = useState(false);
  if (loading) return <Loading />;
  if (error || data == null) return <LoadError error={error} onRetry={reload} />;

  async function markOne(id) {
    await api.post(`/notifications/${id}/read`);
    reload();
  }

  async function toggle(type, enabled) {
    setSaving(true);
    try {
      await api.put('/notifications/preferences', { [type]: enabled });
      prefs.reload();
    } finally {
      setSaving(false);
    }
  }

  const native = isNativeApp();
  return (
    <div className={native ? 'native-stack' : 'card'}>
      <div className="row between">
        <h2 className="m0">{t('nav.notifications')}</h2>
        <button className="b b-ghost" onClick={async () => { await api.post('/notifications/read-all'); reload(); }}>{t('notif.readAll')}</button>
      </div>
      {data.length === 0 && <p className="muted">{t('notif.none')}</p>}
      {data.map((n) => (
        <div key={n.id} className={`notif ${native ? 'native-card' : ''} ${n.is_read ? '' : 'unread'}`}>
          <div>
            {n.type === 'message' && user.role !== 'admin'
              ? <Link to={`/messages/${n.data.thread_id}`}>{textFor(n, t, pick)}</Link>
              : n.type === 'grades_published' && user.role === 'student'
                ? <Link to="/student/grades">{textFor(n, t, pick)}</Link>
                : n.type === 'marked_absent' || n.type === 'absence_warning'
                  ? <Link to="/student/attendance">{textFor(n, t, pick)}</Link>
                  : textFor(n, t, pick)}
          </div>
          <div className="row between">
            <span className="small muted">{String(n.created_at).replace('T', ' ').slice(0, 16)}</span>
            {!n.is_read && <button type="button" className="b b-ghost" onClick={() => markOne(n.id)}>{t('notif.markRead')}</button>}
          </div>
        </div>
      ))}
      <h3>{t('notif.prefs')}</h3>
      {prefs.data && PREF_KEYS.map((key) => (
        <label key={key} className="pref-row">
          <span>{t('notif.pref.' + key)}</span>
          <input type="checkbox" checked={prefs.data[key] !== false} disabled={saving} onChange={(e) => toggle(key, e.target.checked)} />
        </label>
      ))}
    </div>
  );
}
