import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import WeeklySchedule from '../../components/WeeklySchedule';
import { Alert, LoadError, Loading, Stat, Tag } from '../../components/ui';
import { useFeedback } from '../../context/FeedbackContext';
import { isNativeApp } from '../../native/platform';
import { DoctorHomeNative } from '../../native/views';
import { errorText, hhmm } from '../../utils/format';
import { readPosition } from '../../utils/geo';

export default function DoctorHome() {
  const { user } = useAuth();
  const { t, pick } = useLanguage();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useFetch('/instructor/offerings');
  const [actionError, setActionError] = useState('');
  const [starting, setStarting] = useState(false);
  const [autoClose, setAutoClose] = useState('');
  const { toast } = useFeedback();
  const stats = useFetch('/instructor/stats');

  async function startAttendance(o) {
    setStarting(true);
    try {
      let place = {};
      try {
        place = await readPosition();
      } catch {
        const text = t('error.LOCATION_REQUIRED');
        setActionError(text);
        toast({ type: 'error', message: text });
        return;
      }
      const minutes = Number(autoClose);
      const r = await api.post('/attendance/qr', {
        class_id: o.id,
        latitude: place.latitude,
        longitude: place.longitude,
        accuracy: place.accuracy,
        auto_close_minutes: Number.isFinite(minutes) && minutes >= 5 ? minutes : undefined,
      });
      navigate(`/doctor/attendance/${r.data.session_id}`);
    } catch (e) {
      const text = errorText(e, t);
      setActionError(text);
      toast({ type: 'error', message: text });
    } finally {
      setStarting(false);
    }
  }

  if (loading) return <Loading />;
  if (error || data == null) return <LoadError error={error} onRetry={reload} />;
  const items = data.flatMap((o) => o.meetings.map((m) => ({
    ...m, code: o.code, section: o.section, name_ar: o.name_ar, name_en: o.name_en,
  })));
  const open = data.filter((o) => o.open_session_id);
  const pending = data.filter((o) => Number(o.pending_grades) > 0);
  const pendingTotal = data.reduce((n, o) => n + Number(o.pending_grades || 0), 0);

  const autoCloseField = (
    <label className="field">
      <span>{t('att.autoClose')}</span>
      <select value={autoClose} onChange={(e) => setAutoClose(e.target.value)}>
        <option value="">{t('att.autoCloseOff')}</option>
        <option value="10">10</option>
        <option value="20">20</option>
        <option value="40">40</option>
      </select>
    </label>
  );

  if (isNativeApp()) {
    return (
      <>
        {autoCloseField}
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
      </>
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
      {stats.data?.courses?.length > 0 && (
        <div className="card gap-top">
          <h3 className="m0">{t('att.courseStats')}</h3>
          <div className="table-wrap gap-top">
            <table className="table table-cards">
              <thead><tr><th>{t('col.course')}</th><th>{t('att.attendancePct')}</th><th>{t('att.absent')}</th><th>{t('grade.total')}</th></tr></thead>
              <tbody>
                {stats.data.courses.map((course) => (
                  <tr key={course.id}>
                    <td className="card-title" data-label={t('col.course')}><strong>{course.code}</strong> {pick(course.name_ar, course.name_en)}</td>
                    <td data-label={t('att.attendancePct')}>{course.attendance_pct == null ? '—' : `${course.attendance_pct}%`}</td>
                    <td data-label={t('att.absent')}>{course.absent}</td>
                    <td data-label={t('grade.total')}>{course.average_grade ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="card gap-top row between">
        <div>
          <h3 className="m0">{t('att.startLecture')}</h3>
          <p className="muted small m0">{t('att.startLectureHint')}</p>
        </div>
        {autoCloseField}
      </div>

      <div className="card gap-top">
        <h3 className="m0">{t('home.openSessions')}</h3>
        {open.length === 0 ? <p className="muted">{t('home.noneOpen')}</p> : (
          <div className="table-wrap">
            <table className="table table-cards">
              <thead><tr><th>{t('col.code')}</th><th>{t('col.course')}</th><th /></tr></thead>
              <tbody>
                {open.map((o) => (
                  <tr key={o.id}>
                    <td className="card-title" data-label={t('col.code')}><strong>{o.code}</strong></td>
                    <td data-label={t('col.course')}>{pick(o.name_ar, o.name_en)} <Tag kind="ok">{t('att.live')}</Tag></td>
                    <td data-label="" className="actions">
                      <button className="b b-primary" disabled={starting} onClick={() => startAttendance(o)}>{t('doc.continueAtt')}</button>
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
            <table className="table table-cards">
              <thead><tr><th>{t('col.code')}</th><th>{t('col.course')}</th><th>{t('col.pending')}</th><th /></tr></thead>
              <tbody>
                {pending.map((o) => (
                  <tr key={o.id}>
                    <td className="card-title" data-label={t('col.code')}><strong>{o.code}</strong></td>
                    <td data-label={t('col.course')}>{pick(o.name_ar, o.name_en)}</td>
                    <td data-label={t('col.pending')}><Tag kind="warn">{o.pending_grades}</Tag></td>
                    <td data-label="" className="actions">
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
          <table className="table table-cards">
            <thead><tr><th>{t('col.code')}</th><th>{t('col.course')}</th><th>{t('col.students')}</th><th>{t('col.pending')}</th><th>{t('col.schedule')}</th><th /></tr></thead>
            <tbody>
              {data.length === 0 && <tr className="empty-row"><td colSpan={6} className="muted">{t('reg.none')}</td></tr>}
              {data.map((o) => (
                <tr key={o.id}>
                  <td className="card-title" data-label={t('col.code')}><strong>{o.code}</strong></td>
                  <td data-label={t('col.course')}>{pick(o.name_ar, o.name_en)}</td>
                  <td data-label={t('col.students')}>{o.enrolled_count}/{o.capacity}</td>
                  <td data-label={t('col.pending')}>{Number(o.pending_grades) > 0 ? <Tag kind="warn">{o.pending_grades}</Tag> : 0}</td>
                  <td className="small" data-label={t('col.schedule')}>{o.meetings.map((m) => `${t('day.' + m.day_of_week)} ${hhmm(m.start_time)}`).join(' | ')}</td>
                  <td data-label="" className="actions">
                    <Link className="b b-ghost" to={`/doctor/offerings/${o.id}`}>{t('doc.gradesStudents')}</Link>
                    <button className="b b-primary" disabled={starting} onClick={() => startAttendance(o)}>
                      {o.open_session_id ? t('doc.continueAtt') : t('att.startLecture')}
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
