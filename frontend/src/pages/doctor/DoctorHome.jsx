import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import WeeklySchedule from '../../components/WeeklySchedule';
import { Alert, Loading, Tag } from '../../components/ui';
import { errorText, hhmm } from '../../utils/format';

export default function DoctorHome() {
  const { user } = useAuth();
  const { t, pick } = useLanguage();
  const navigate = useNavigate();
  const { data, loading } = useFetch('/instructor/offerings');
  const [error, setError] = useState('');

  async function startAttendance(o) {
    try {
      const r = await api.post('/attendance/sessions', { offering_id: o.id });
      navigate(`/doctor/attendance/${r.data.id}`);
    } catch (e) { setError(errorText(e, t)); }
  }

  if (loading || !data) return <Loading />;
  const items = data.flatMap((o) => o.meetings.map((m) => ({ ...m, code: o.code, name_ar: o.name_ar, name_en: o.name_en })));

  return (
    <>
      <div className="card">
        <h2 className="m0">{t('home.welcome')} {pick(user.full_name_ar, user.full_name_en)}</h2>
        <Alert>{error}</Alert>
        <div className="table-wrap gap-top">
          <table className="table">
            <thead><tr><th>{t('col.code')}</th><th>{t('col.course')}</th><th>{t('col.students')}</th><th>{t('col.schedule')}</th><th /></tr></thead>
            <tbody>
              {data.length === 0 && <tr><td colSpan={5} className="muted">{t('reg.none')}</td></tr>}
              {data.map((o) => (
                <tr key={o.id}>
                  <td><strong>{o.code}</strong></td>
                  <td>{pick(o.name_ar, o.name_en)}</td>
                  <td>{o.enrolled_count}/{o.capacity}</td>
                  <td className="small">{o.meetings.map((m) => `${t('day.' + m.day_of_week)} ${hhmm(m.start_time)}`).join(' | ')}</td>
                  <td className="actions">
                    <Link className="b b-ghost" to={`/doctor/offerings/${o.id}`}>{t('doc.gradesStudents')}</Link>
                    <button className="b b-primary" onClick={() => startAttendance(o)}>
                      {o.open_session_id ? t('doc.continueAtt') : t('doc.startAtt')}
                    </button>
                    {o.open_session_id && <Tag kind="ok">{t('att.live')}</Tag>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card gap-top">
        <h3 className="m0">{t('nav.schedule')}</h3>
        <WeeklySchedule items={items} />
      </div>
    </>
  );
}
