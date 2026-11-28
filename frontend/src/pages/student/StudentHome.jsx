import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import { useCachedFetch } from '../../utils/offlineCache';
import { Alert, LoadError, Loading, Meter, Stat, Tag } from '../../components/ui';
import { isNativeApp } from '../../native/platform';
import { StudentHomeNative } from '../../native/views';
import { hhmm } from '../../utils/format';
import { nextScheduleMeetings } from '../../utils/schedule';

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
  const schedule = useCachedFetch('/enrollments/me', 'schedule');
  const att = useFetch('/attendance/me');
  const grades = useCachedFetch('/student/grades', 'grades');
  const s = user.student;
  const sum = summary.data;
  const courses = schedule.data?.courses || [];
  const meetings = courses.flatMap((c) => (c.meetings || []).map((m) => ({
    ...m, code: c.code, section: c.section, name_ar: c.name_ar, name_en: c.name_en,
  })));
  const upcoming = nextScheduleMeetings(courses);
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

  const offline = schedule.offline || grades.offline;

  return (
    <>
      <div className="card home-hero">
        <p className="kicker">{t('home.welcome')}</p>
        <h2 className="m0">{pick(user.full_name_ar, user.full_name_en)}</h2>
        <p className="muted">
          {t('student.code')}: <bdi>{s?.student_code}</bdi> · {t('student.department')}: {pick(s?.department_ar, s?.department_en)}
        </p>
        {offline && <Alert type="info">{t('offline.banner')}</Alert>}
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
            {att.data.filter((a) => a.warning || a.approaching).map((w) => (
              <Alert key={w.offering_id} type={w.warning ? 'error' : 'warn'}>
                {w.warning ? t('att.exceeded') : t('att.approaching')}: <strong>{w.code}</strong> — {pick(w.name_ar, w.name_en)} ({w.absent_pct}%)
              </Alert>
            ))}
            {att.data.filter((a) => !a.warning && !a.approaching).length === att.data.length && att.data.length > 0 && (
              <p className="muted">{t('att.allClear')}</p>
            )}
            {att.data.slice(0, 3).map((a) => (
              <div key={a.offering_id} className="gap-top">
                <div className="row between"><strong>{a.code}</strong><span className="muted small">{a.attended}/{a.total_sessions}</span></div>
                <Meter value={a.total_sessions ? Math.round((a.attended / a.total_sessions) * 100) : 0} label={a.code} />
              </div>
            ))}
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
