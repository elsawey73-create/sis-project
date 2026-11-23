import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import { LoadError, Loading } from '../../components/ui';

export default function Notifications() {
  const { user } = useAuth();
  const { t, pick } = useLanguage();
  const { data, error, loading, reload } = useFetch('/notifications');
  if (loading) return <Loading />;
  if (error || data == null) return <LoadError error={error} onRetry={reload} />;

  const text = (n) => {
    if (n.type === 'message') return `${t('notif.message')} ${pick(n.data.from_ar, n.data.from_en)}`;
    if (n.type === 'grades_published') return `${t('notif.grades')} ${n.data.course_code} — ${pick(n.data.course_ar, n.data.course_en)}`;
    return n.type;
  };

  return (
    <div className="card">
      <div className="row between">
        <h2 className="m0">{t('nav.notifications')}</h2>
        <button className="b b-ghost" onClick={async () => { await api.post('/notifications/read-all'); reload(); }}>{t('notif.readAll')}</button>
      </div>
      {data.length === 0 && <p className="muted">{t('notif.none')}</p>}
      {data.map((n) => (
        <div key={n.id} className={`notif ${n.is_read ? '' : 'unread'}`}>
          <div>
            {n.type === 'message' && user.role !== 'admin'
              ? <Link to={`/messages/${n.data.thread_id}`}>{text(n)}</Link>
              : text(n)}
          </div>
          <div className="small muted">{n.created_at}</div>
        </div>
      ))}
    </div>
  );
}
