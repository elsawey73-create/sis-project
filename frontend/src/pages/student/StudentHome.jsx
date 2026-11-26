import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import WeeklySchedule from '../../components/WeeklySchedule';
import { Alert, LoadError, Loading, Stat, Tag } from '../../components/ui';
import { isNativeApp } from '../../native/platform';
import { StudentHomeNative } from '../../native/views';
import { hhmm } from '../../utils/format';

const WEEK = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'];
const FROM_JS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function minutesOf(time) {
  const [h, m] = String(time || '').slice(0, 5).split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

// Next remaining meeting day in the Sat–Thu week. Friday has no classes.
function nextMeetings(courses, now = new Date()) {
  const todayIdx = WEEK.indexOf(FROM_JS[now.getDay()]);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const items = (courses || []).flatMap((c) => (c.meetings || []).map((m) => ({
    ...m,
    code: c.code,
    name_ar: c.name_ar,
    name_en: c.name_en,
    idx: WEEK.indexOf(m.day_of_week),
  }))).filter((m) => m.idx >= 0);
  if (!items.length) return [];
  const rank = (m) => {
    if (todayIdx < 0) return m.idx + 1;
    if (m.idx > todayIdx) return m.idx;
    if (m.idx === todayIdx && minutesOf(m.start_time) > nowMin) return m.idx;
    return m.idx + 7;
  };
  const best = Math.min(...items.map(rank));
  return items.filter((m) => rank(m) === best).sort((a, b) => (a.start_time < b.start_time ? -1 : 1));
}

function Block({ title, to, children }) {
  const { t } = useLanguage();
  return (
    <div className="card gap-top">
      <div className="row between">
        <h3 className="m0">{title}</h3>
        {to && <Link className="b b-ghost" to={to}>{t('home.viewAll')}</Link>}
      </div>
      {children}
    </div>
  );
}

export default function StudentHome() {
  const { user } = useAuth();
  const { t, pick } = useLanguage();
  const summary = useFetch('/student/summary');
  const schedule = useFetch('/enrollments/me');
  const att = useFetch('/attendance/me');
  const grades = useFetch('/student/grades');
  const s = user.student;
  const sum = summary.data;
  const courses = schedule.data?.courses || [];
  const meetings = courses.flatMap((c) => (c.meetings || []).map((m) => ({ ...m, code: c.code, name_ar: c.name_ar, name_en: c.name_en })));
  const upcoming = nextMeetings(courses);
  const recent = (grades.data || []).slice(0, 5);

  if (isNativeApp()) {
    return (
      <StudentHomeNative
        user={user}
        summary={summary}
        schedule={schedule}
        att={att}
        grades={grades}
        courses={courses}
        meetings={meetings}
        upcoming={upcoming}
        recent={recent}
      />
    );
  }

  return (
    <>
      <div className="card">
        <h2>{t('home.welcome')} {pick(user.full_name_ar, user.full_name_en)}</h2>
        <p className="muted">
          {t('student.code')}: <bdi>{s?.student_code}</bdi> · {t('student.department')}: {pick(s?.department_ar, s?.department_en)}
        </p>
      </div>

      {summary.loading ? <Loading /> : summary.error || !sum ? <LoadError error={summary.error} onRetry={summary.reload} /> : (
        <>
          <div className="grid-3 gap-top">
            <Stat label={t('stat.cgpa')} value={sum.standing.cgpa ?? '—'} />
            <Stat label={t('stat.creditsEarned')} value={sum.standing.credits_earned} />
            <Stat
              label={t('stat.currentCredits')}
              value={`${sum.current.credits} / ${sum.max_credits}`}
              hint={sum.semester ? pick(sum.semester.name_ar, sum.semester.name_en) : ''}
            />
          </div>
          {sum.semester?.registration_open && (
            <div className="card gap-top row between">
              <span><Tag kind="ok">{t('reg.open')}</Tag> {t('home.regHint')}</span>
              <Link className="b b-primary" to="/student/registration">{t('nav.registration')}</Link>
            </div>
          )}
        </>
      )}

      <Block title={t('home.schedule')} to="/student/schedule">
        {schedule.loading ? <Loading /> : schedule.error || schedule.data == null ? <LoadError error={schedule.error} onRetry={schedule.reload} /> : (
          courses.length === 0 ? <p className="muted">{t('reg.none')}</p> : <WeeklySchedule items={meetings} />
        )}
      </Block>

      <Block title={t('home.attendance')} to="/student/attendance">
        <p className="small"><strong>{t('home.nextMeetings')}</strong></p>
        {schedule.loading ? <Loading /> : schedule.error || schedule.data == null ? null : upcoming.length === 0 ? (
          <p className="muted">{courses.length === 0 ? t('reg.none') : t('home.noMeetings')}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {upcoming.map((m, i) => (
                  <tr key={`${m.code}-${m.day_of_week}-${m.start_time}-${i}`}>
                    <td><strong>{m.code}</strong> {pick(m.name_ar, m.name_en)}</td>
                    <td>{t('day.' + m.day_of_week)} {hhmm(m.start_time)}–{hhmm(m.end_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {att.loading ? <Loading /> : att.error || att.data == null ? <LoadError error={att.error} onRetry={att.reload} /> : (
          <>
            {att.data.filter((a) => a.warning).map((w) => (
              <Alert key={w.offering_id} type="warn">
                {t('att.warning')}: <strong>{w.code}</strong> — {pick(w.name_ar, w.name_en)} ({w.absent_pct}%)
              </Alert>
            ))}
            <div className="table-wrap gap-top">
              <table className="table">
                <thead><tr><th>{t('col.course')}</th><th>{t('att.attended')}</th><th>{t('att.absent')}</th><th /></tr></thead>
                <tbody>
                  {att.data.length === 0 && <tr><td colSpan={4} className="muted">{t('reg.none')}</td></tr>}
                  {att.data.map((a) => (
                    <tr key={a.offering_id}>
                      <td><strong>{a.code}</strong> {pick(a.name_ar, a.name_en)}</td>
                      <td>{a.attended}/{a.total_sessions}</td>
                      <td>{a.absent} ({a.absent_pct}%)</td>
                      <td>{a.warning ? <Tag kind="err">{t('att.warning')}</Tag> : <Tag kind="ok">OK</Tag>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Block>

      <Block title={t('home.recentGrades')} to="/student/grades">
        {grades.loading ? <Loading /> : grades.error || grades.data == null ? <LoadError error={grades.error} onRetry={grades.reload} /> : recent.length === 0 ? (
          <p className="muted">{t('grades.none')}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('col.course')}</th><th>{t('col.semester')}</th><th>{t('grade.letter')}</th></tr></thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.enrollment_id}>
                    <td><strong>{r.code}</strong> {pick(r.name_ar, r.name_en)} {r.replaced && <Tag kind="muted">{t('grade.replaced')}</Tag>}</td>
                    <td>{pick(r.semester_ar, r.semester_en)}</td>
                    <td><span className={`tag ${r.points > 0 ? 'tag-ok' : 'tag-err'}`}>{r.letter}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Block>
    </>
  );
}
