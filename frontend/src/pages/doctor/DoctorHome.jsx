import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import WeeklySchedule from '../../components/WeeklySchedule';
import { Alert, LoadError, Loading, Stat, Tag } from '../../components/ui';
import { isNativeApp } from '../../native/platform';
import { DoctorHomeNative } from '../../native/views';
import { errorText, hhmm } from '../../utils/format';

export default function DoctorHome() {
  const { user } = useAuth();
  const { t, pick } = useLanguage();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useFetch('/instructor/offerings');
  const [actionError, setActionError] = useState('');

  async function startAttendance(o) {
    try {
      const r = await api.post('/attendance/sessions', { offering_id: o.id });
      navigate(`/doctor/attendance/${r.data.id}`);
    } catch (e) { setActionError(errorText(e, t)); }
  }

  if (loading) return <Loading />;
  if (error || data == null) return <LoadError error={error} onRetry={reload} />;
  const items = data.flatMap((o) => o.meetings.map((m) => ({ ...m, code: o.code, name_ar: o.name_ar, name_en: o.name_en })));
  const open = data.filter((o) => o.open_session_id);
  const pending = data.filter((o) => Number(o.pending_grades) > 0);
  const pendingTotal = data.reduce((n, o) => n + Number(o.pending_grades || 0), 0);

  if (isNativeApp()) {
    return (
      <DoctorHomeNative
        user={user}
        data={data}
        items={items}
        open={open}
        pending={pending}
        pendingTotal={pendingTotal}
        actionError={actionError}
        onStart={startAttendance}
      />
    );
  }

  return (
    <>
      <div className="card">
        <h2 className="m0">{t('home.welcome')} {pick(user.full_name_ar, user.full_name_en)}</h2>
        <Alert>{actionError}</Alert>
      </div>
      <div className="grid-3 gap-top">
        <Stat label={t('home.sections')} value={data.length} />
        <Stat label={t('home.pendingGrades')} value={pendingTotal} />
        <Stat label={t('home.openSessions')} value={open.length} />
      </div>

      <div className="card gap-top">
        <h3 className="m0">{t('home.openSessions')}</h3>
        {open.length === 0 ? <p className="muted">{t('home.noneOpen')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('col.code')}</th><th>{t('col.course')}</th><th /></tr></thead>
              <tbody>
                {open.map((o) => (
                  <tr key={o.id}>
                    <td><strong>{o.code}</strong></td>
                    <td>{pick(o.name_ar, o.name_en)} <Tag kind="ok">{t('att.live')}</Tag></td>
                    <td className="actions">
                      <button className="b b-primary" onClick={() => startAttendance(o)}>{t('doc.continueAtt')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card gap-top">
        <h3 className="m0">{t('home.pendingGrades')}</h3>
        {pending.length === 0 ? <p className="muted">{t('home.nonePending')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('col.code')}</th><th>{t('col.course')}</th><th>{t('col.pending')}</th><th /></tr></thead>
              <tbody>
                {pending.map((o) => (
                  <tr key={o.id}>
                    <td><strong>{o.code}</strong></td>
                    <td>{pick(o.name_ar, o.name_en)}</td>
                    <td><Tag kind="warn">{o.pending_grades}</Tag></td>
                    <td className="actions">
                      <Link className="b b-ghost" to={`/doctor/offerings/${o.id}`}>{t('doc.gradesStudents')}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card gap-top">
        <h3 className="m0">{t('home.sections')}</h3>
        <div className="table-wrap gap-top">
          <table className="table">
            <thead><tr><th>{t('col.code')}</th><th>{t('col.course')}</th><th>{t('col.students')}</th><th>{t('col.pending')}</th><th>{t('col.schedule')}</th><th /></tr></thead>
            <tbody>
              {data.length === 0 && <tr><td colSpan={6} className="muted">{t('reg.none')}</td></tr>}
              {data.map((o) => (
                <tr key={o.id}>
                  <td><strong>{o.code}</strong></td>
                  <td>{pick(o.name_ar, o.name_en)}</td>
                  <td>{o.enrolled_count}/{o.capacity}</td>
                  <td>{Number(o.pending_grades) > 0 ? <Tag kind="warn">{o.pending_grades}</Tag> : 0}</td>
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
