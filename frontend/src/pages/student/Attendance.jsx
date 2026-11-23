import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import { Alert, LoadError, Loading, Tag } from '../../components/ui';

export default function Attendance() {
  const { t, pick } = useLanguage();
  const { data, error, loading, reload } = useFetch('/attendance/me');
  if (loading) return <Loading />;
  if (error || data == null) return <LoadError error={error} onRetry={reload} />;
  return (
    <div className="card">
      <h2 className="m0">{t('nav.attendance')}</h2>
      <Alert type="info">{t('att.howto')}</Alert>
      <div className="table-wrap gap-top">
        <table className="table">
          <thead><tr><th>{t('col.course')}</th><th>{t('att.sessions')}</th><th>{t('att.attended')}</th><th>{t('att.absent')}</th><th /></tr></thead>
          <tbody>
            {data.length === 0 && <tr><td colSpan={5} className="muted">{t('reg.none')}</td></tr>}
            {data.map((a) => (
              <tr key={a.offering_id}>
                <td><strong>{a.code}</strong> {pick(a.name_ar, a.name_en)}</td>
                <td>{a.total_sessions}</td><td>{a.attended}</td><td>{a.absent} ({a.absent_pct}%)</td>
                <td>{a.warning ? <Tag kind="err">{t('att.warning')}</Tag> : <Tag kind="ok">OK</Tag>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
