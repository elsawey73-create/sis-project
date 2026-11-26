import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { Alert, FetchBody, LoadError, Loading, Tag } from '../components/ui';
import { hhmm } from '../utils/format';
import DayAgenda from './DayAgenda';
import Icon from './icons';
import { openScanner } from './platform';

function Stack({ children }) {
  return <div className="native-stack">{children}</div>;
}

function Section({ title, to, children }) {
  const { t } = useLanguage();
  return (
    <section className="native-section">
      <div className="native-section-head">
        <h2>{title}</h2>
        {to && <Link to={to}>{t('home.viewAll')}</Link>}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, hint }) {
  return (
    <article className="native-metric native-card">
      <div className="native-metric-value">{value}</div>
      <div className="native-metric-label">{label}</div>
      {hint ? <div className="muted small">{hint}</div> : null}
    </article>
  );
}

function Chips({ meetings }) {
  const { t } = useLanguage();
  if (!meetings?.length) return null;
  return (
    <div className="native-chips">
      {meetings.map((meeting, index) => (
        <span key={`${meeting.day_of_week}-${meeting.start_time}-${index}`} className="native-chip">
          {t(`day.${meeting.day_of_week}`)} {hhmm(meeting.start_time)}–{hhmm(meeting.end_time)}
          {meeting.room ? ` · ${meeting.room}` : ''}
        </span>
      ))}
    </div>
  );
}

export function StudentHomeNative({ user, summary, schedule, att, grades, courses, meetings, upcoming, recent }) {
  const { t, pick } = useLanguage();
  const student = user.student;
  const sum = summary.data;

  return (
    <Stack>
      <section className="native-hero native-card">
        <p className="native-kicker">{t('home.welcome')}</p>
        <h2 className="m0">{pick(user.full_name_ar, user.full_name_en)}</h2>
        <p className="muted">
          {t('student.code')}: <bdi>{student?.student_code}</bdi>
          {' · '}
          {t('student.department')}: {pick(student?.department_ar, student?.department_en)}
        </p>
      </section>

      <button type="button" className="native-scan-cta" onClick={openScanner}>
        <Icon name="qr" />
        <span>
          <strong>{t('nav.scan')}</strong>
          <small>{t('native.scanHint')}</small>
        </span>
      </button>

      {summary.loading ? <Loading /> : summary.error || !sum ? <LoadError error={summary.error} onRetry={summary.reload} /> : (
        <>
          <div className="native-metrics">
            <Metric label={t('stat.cgpa')} value={sum.standing.cgpa ?? '—'} />
            <Metric label={t('stat.creditsEarned')} value={sum.standing.credits_earned} />
            <Metric
              label={t('stat.currentCredits')}
              value={`${sum.current.credits} / ${sum.max_credits}`}
              hint={sum.semester ? pick(sum.semester.name_ar, sum.semester.name_en) : ''}
            />
          </div>
          {sum.semester?.registration_open && (
            <article className="native-card native-card-top">
              <span><Tag kind="ok">{t('reg.open')}</Tag> {t('home.regHint')}</span>
              <Link className="b b-primary" to="/student/registration">{t('nav.registration')}</Link>
            </article>
          )}
        </>
      )}

      <Section title={t('home.nextMeetings')} to="/student/schedule">
        {schedule.loading ? <Loading /> : schedule.error || schedule.data == null ? <LoadError error={schedule.error} onRetry={schedule.reload} /> : upcoming.length === 0 ? (
          <p className="native-empty muted">{courses.length === 0 ? t('reg.none') : t('home.noMeetings')}</p>
        ) : (
          <Stack>
            {upcoming.map((meeting, index) => (
              <article key={`${meeting.code}-${meeting.start_time}-${index}`} className="native-card native-slot">
                <div className="native-slot-time">
                  <strong><bdi>{hhmm(meeting.start_time)}</bdi></strong>
                  <span>{t(`day.${meeting.day_of_week}`)}</span>
                </div>
                <div>
                  <strong>{meeting.code}</strong>
                  <div>{pick(meeting.name_ar, meeting.name_en)}</div>
                </div>
              </article>
            ))}
          </Stack>
        )}
      </Section>

      <Section title={t('home.schedule')} to="/student/schedule">
        {schedule.loading ? <Loading /> : schedule.error || schedule.data == null ? null : courses.length === 0 ? (
          <p className="native-empty muted">{t('reg.none')}</p>
        ) : <DayAgenda items={meetings} />}
      </Section>

      <Section title={t('home.attendance')} to="/student/attendance">
        {att.loading ? <Loading /> : att.error || att.data == null ? <LoadError error={att.error} onRetry={att.reload} /> : (
          <Stack>
            {att.data.filter((row) => row.warning).map((row) => (
              <Alert key={row.offering_id} type="warn">
                {t('att.warning')}: <strong>{row.code}</strong> — {pick(row.name_ar, row.name_en)} ({row.absent_pct}%)
              </Alert>
            ))}
            {att.data.length === 0 && <p className="native-empty muted">{t('reg.none')}</p>}
            {att.data.map((row) => <AttendanceCard key={row.offering_id} row={row} />)}
          </Stack>
        )}
      </Section>

      <Section title={t('home.recentGrades')} to="/student/grades">
        {grades.loading ? <Loading /> : grades.error || grades.data == null ? <LoadError error={grades.error} onRetry={grades.reload} /> : recent.length === 0 ? (
          <p className="native-empty muted">{t('grades.none')}</p>
        ) : (
          <Stack>
            {recent.map((row) => (
              <article key={row.enrollment_id} className="native-card">
                <div className="native-card-top">
                  <div>
                    <span className="native-code">{row.code}</span>
                    <strong>{pick(row.name_ar, row.name_en)}</strong>
                  </div>
                  <span className={`tag ${row.points > 0 ? 'tag-ok' : 'tag-err'}`}>{row.letter}</span>
                </div>
                <div className="muted small">{pick(row.semester_ar, row.semester_en)}</div>
              </article>
            ))}
          </Stack>
        )}
      </Section>
    </Stack>
  );
}

function AttendanceCard({ row }) {
  const { t, pick } = useLanguage();
  const pct = row.total_sessions ? Math.max(0, Math.min(100, Math.round((row.attended / row.total_sessions) * 100))) : 0;
  return (
    <article className="native-card">
      <div className="native-card-top">
        <div>
          <span className="native-code">{row.code}</span>
          <strong>{pick(row.name_ar, row.name_en)}</strong>
        </div>
        {row.warning ? <Tag kind="err">{t('att.warning')}</Tag> : <Tag kind="ok">OK</Tag>}
      </div>
      <div className="native-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
      <div className="native-score-grid">
        <div className="native-score"><span>{t('att.attended')}</span><strong>{row.attended}/{row.total_sessions}</strong></div>
        <div className="native-score"><span>{t('att.absent')}</span><strong>{row.absent} ({row.absent_pct}%)</strong></div>
      </div>
    </article>
  );
}

export function AttendanceNative({ rows }) {
  const { t } = useLanguage();
  return (
    <Stack>
      <button type="button" className="native-scan-cta" onClick={openScanner}>
        <Icon name="qr" />
        <span>
          <strong>{t('nav.scan')}</strong>
          <small>{t('att.howtoApp')}</small>
        </span>
      </button>
      {rows.length === 0 && <p className="native-empty muted">{t('reg.none')}</p>}
      {rows.map((row) => <AttendanceCard key={row.offering_id} row={row} />)}
    </Stack>
  );
}

export function GradesNative({ groups }) {
  const { t, pick } = useLanguage();
  if (groups.length === 0) return <p className="native-empty muted">{t('grades.none')}</p>;
  return (
    <Stack>
      {groups.map((group) => (
        <section key={group.id} className="native-section">
          <h2>{pick(group.ar, group.en)}</h2>
          <Stack>
            {group.rows.map((row) => (
              <article key={row.enrollment_id} className={`native-card${row.replaced ? ' is-muted' : ''}`}>
                <div className="native-card-top">
                  <div>
                    <span className="native-code">{row.code}</span>
                    <strong>{pick(row.name_ar, row.name_en)}</strong>
                    {row.replaced && <Tag kind="muted">{t('grade.replaced')}</Tag>}
                  </div>
                  <span className={`tag ${row.points > 0 ? 'tag-ok' : 'tag-err'}`}>{row.letter}</span>
                </div>
                <div className="native-score-grid">
                  <div className="native-score"><span>{t('grade.coursework')}</span><strong>{row.coursework}/{row.max.coursework}</strong></div>
                  <div className="native-score"><span>{t('grade.midterm')}</span><strong>{row.midterm}/{row.max.midterm}</strong></div>
                  <div className="native-score"><span>{t('grade.practical')}</span><strong>{row.has_practical ? `${row.practical}/${row.max.practical}` : '—'}</strong></div>
                  <div className="native-score"><span>{t('grade.final')}</span><strong>{row.final_exam}/{row.max.final_exam}</strong></div>
                  <div className="native-score"><span>{t('grade.total')}</span><strong>{row.total}</strong></div>
                </div>
              </article>
            ))}
          </Stack>
        </section>
      ))}
    </Stack>
  );
}

export function RegistrationNative({ q, setQ, dept, setDept, depts, offers, mine, msg, open, busy, onDrop, renderAction }) {
  const { t, pick } = useLanguage();
  return (
    <Stack>
      <article className="native-card">
        <div className="native-card-top">
          <h2 className="m0">{t('nav.registration')}</h2>
          {mine.data?.semester && (
            <Tag kind={open ? 'ok' : 'err'}>{open ? t('reg.open') : t('reg.closed')}</Tag>
          )}
        </div>
        {mine.data?.semester && <p className="muted">{pick(mine.data.semester.name_ar, mine.data.semester.name_en)}</p>}
        <Alert type={msg?.type}>{msg?.text}</Alert>
      </article>

      <section className="native-section">
        <h2>{t('reg.myCourses')}</h2>
        <FetchBody loading={mine.loading} error={mine.error} data={mine.data} onRetry={mine.reload}>
          {(enrolled) => (
            <Stack>
              {enrolled.courses.length === 0 && <p className="native-empty muted">{t('reg.none')}</p>}
              {enrolled.courses.map((course) => (
                <article key={course.enrollment_id} className="native-card">
                  <div className="native-card-top">
                    <div>
                      <span className="native-code">{course.code}</span>
                      <strong>{pick(course.name_ar, course.name_en)}</strong>
                    </div>
                    <span className="tag tag-info">{course.credit_hours}</span>
                  </div>
                  <Chips meetings={course.meetings} />
                  {course.status === 'enrolled' ? (
                    <button type="button" className="btn-small" disabled={busy || !open} onClick={() => onDrop(course)}>{t('reg.drop')}</button>
                  ) : (
                    <Tag kind={course.status === 'failed' ? 'err' : 'info'}>{t(course.status === 'failed' ? 'reg.failed' : 'reg.completed')}</Tag>
                  )}
                </article>
              ))}
              <p><strong>{t('reg.total')}: {enrolled.total_credits} / {enrolled.max_credits}</strong></p>
            </Stack>
          )}
        </FetchBody>
      </section>

      <section className="native-section">
        <h2>{t('reg.available')}</h2>
        <div className="native-filters">
          <input placeholder={t('catalog.search')} value={q} onChange={(event) => setQ(event.target.value)} />
          <select value={dept} onChange={(event) => setDept(event.target.value)}>
            <option value="">{t('catalog.allDepts')}</option>
            {(depts.data || []).map((item) => <option key={item.id} value={item.id}>{pick(item.name_ar, item.name_en)}</option>)}
          </select>
        </div>
        {depts.error && <LoadError error={depts.error} onRetry={depts.reload} />}
        <FetchBody loading={offers.loading} error={offers.error} data={offers.data} onRetry={offers.reload}>
          {(list) => (
            <Stack>
              {list.length === 0 && <p className="native-empty muted">{t('reg.none')}</p>}
              {list.map((offering) => (
                <article key={offering.id} className="native-card">
                  <div className="native-card-top">
                    <div>
                      <span className="native-code">{offering.code}</span>
                      <strong>{pick(offering.name_ar, offering.name_en)}</strong>
                    </div>
                    <span className="tag tag-muted">{offering.credit_hours}</span>
                  </div>
                  <p className="muted small">{t('col.instructor')}: {pick(offering.instructor_ar, offering.instructor_en)}</p>
                  <Chips meetings={offering.meetings} />
                  <div className="native-card-top">
                    <span className="muted small">{t('col.seats')}: {offering.enrolled_count}/{offering.capacity}</span>
                    {renderAction(offering)}
                  </div>
                </article>
              ))}
            </Stack>
          )}
        </FetchBody>
      </section>
    </Stack>
  );
}

export function TranscriptNative({ data }) {
  const { t, pick } = useLanguage();
  const { student: profile, semesters, standing } = data;
  return (
    <Stack>
      <article className="native-card">
        <div className="native-card-top no-print">
          <h2 className="m0">{t('nav.transcript')}</h2>
          <button type="button" className="b b-primary" onClick={() => window.print()}>{t('transcript.print')}</button>
        </div>
        <div className="print-head">
          <h2>{t('transcript.title')}</h2>
        </div>
        <div className="native-score-grid">
          <div className="native-score"><span>{t('transcript.name')}</span><strong>{pick(profile.full_name_ar, profile.full_name_en)}</strong></div>
          <div className="native-score"><span>{t('student.code')}</span><strong><bdi>{profile.student_code}</bdi></strong></div>
          <div className="native-score"><span>{t('student.department')}</span><strong>{pick(profile.department_ar, profile.department_en)}</strong></div>
          <div className="native-score"><span>{t('transcript.level')}</span><strong>{profile.level} · {profile.admission_year}</strong></div>
        </div>
      </article>

      {semesters.length === 0 && <p className="native-empty muted">{t('grades.none')}</p>}
      {semesters.map((semester) => (
        <section key={semester.id} className="native-card avoid-break">
          <h3 className="m0">{pick(semester.name_ar, semester.name_en)}</h3>
          <Stack>
            {semester.courses.map((course) => (
              <div key={course.enrollment_id} className={`native-line${course.replaced ? ' is-muted' : ''}`}>
                <div>
                  <strong>{course.code}</strong> {pick(course.name_ar, course.name_en)}
                  {course.replaced && <Tag kind="muted">{t('grade.replaced')}</Tag>}
                </div>
                <div className="muted small">{course.credit_hours} · {course.total} · {course.letter} · {Number(course.points).toFixed(1)}</div>
              </div>
            ))}
          </Stack>
          <p className="small">
            {t('transcript.semGpa')}: <strong>{semester.gpa?.toFixed(2)}</strong>
            {' · '}
            {t('transcript.attempted')}: {semester.credits_attempted}
            {' · '}
            {t('transcript.earned')}: {semester.credits_earned}
          </p>
        </section>
      ))}

      {semesters.some((semester) => semester.courses.some((course) => course.replaced)) && (
        <p className="small muted">{t('transcript.repeatNote')}</p>
      )}

      <div className="native-metrics">
        <Metric label={t('stat.cgpa')} value={standing.cgpa?.toFixed(2) ?? '—'} />
        <Metric label={t('transcript.attempted')} value={standing.credits_attempted} />
        <Metric label={t('transcript.earned')} value={standing.credits_earned} />
      </div>
    </Stack>
  );
}

export function CatalogNative({ q, setQ, dept, setDept, courses, depts, open, setOpen }) {
  const { t, pick } = useLanguage();
  return (
    <Stack>
      <div className="native-filters">
        <input placeholder={t('catalog.search')} value={q} onChange={(event) => setQ(event.target.value)} />
        <select value={dept} onChange={(event) => setDept(event.target.value)}>
          <option value="">{t('catalog.allDepts')}</option>
          {(depts.data || []).map((item) => <option key={item.id} value={item.id}>{pick(item.name_ar, item.name_en)}</option>)}
        </select>
      </div>
      {depts.error && <LoadError error={depts.error} onRetry={depts.reload} />}
      <FetchBody loading={courses.loading} error={courses.error} data={courses.data} onRetry={courses.reload}>
        {(list) => (
          <Stack>
            {list.length === 0 && <p className="native-empty muted">{t('reg.none')}</p>}
            {list.map((course) => {
              const expanded = open === course.id;
              return (
                <article key={course.id} className={`native-card${expanded ? ' is-open' : ''}`}>
                  <button type="button" className="native-card-toggle" onClick={() => setOpen(expanded ? null : course.id)}>
                    <span>
                      <span className="native-code">{course.code}</span>
                      <strong>{pick(course.name_ar, course.name_en)}</strong>
                    </span>
                    <span className="tag tag-info">{course.credit_hours}{course.has_practical ? ` · ${t('catalog.practical')}` : ''}</span>
                  </button>
                  <p className="muted small">{pick(course.department_ar, course.department_en)}</p>
                  {expanded && (
                    <div className="native-detail">
                      <p>{pick(course.description_ar, course.description_en) || '—'}</p>
                      <p className="small">
                        <strong>{t('col.prereq')}:</strong>{' '}
                        {course.prerequisites.length ? course.prerequisites.map((item) => `${item.code} ${pick(item.name_ar, item.name_en)}`).join(' · ') : '—'}
                      </p>
                    </div>
                  )}
                </article>
              );
            })}
          </Stack>
        )}
      </FetchBody>
    </Stack>
  );
}

export function DoctorHomeNative({ user, data, items, open, pending, pendingTotal, actionError, onStart }) {
  const { t, pick } = useLanguage();
  return (
    <Stack>
      <section className="native-hero native-card">
        <p className="native-kicker">{t('home.welcome')}</p>
        <h2 className="m0">{pick(user.full_name_ar, user.full_name_en)}</h2>
        <Alert>{actionError}</Alert>
      </section>
      <div className="native-metrics">
        <Metric label={t('home.sections')} value={data.length} />
        <Metric label={t('home.pendingGrades')} value={pendingTotal} />
        <Metric label={t('home.openSessions')} value={open.length} />
      </div>

      <Section title={t('home.openSessions')}>
        {open.length === 0 ? <p className="native-empty muted">{t('home.noneOpen')}</p> : (
          <Stack>
            {open.map((offering) => (
              <article key={offering.id} className="native-card">
                <div className="native-card-top">
                  <div>
                    <span className="native-code">{offering.code}</span>
                    <strong>{pick(offering.name_ar, offering.name_en)}</strong>
                  </div>
                  <Tag kind="ok">{t('att.live')}</Tag>
                </div>
                <button type="button" className="b b-primary" onClick={() => onStart(offering)}>{t('doc.continueAtt')}</button>
              </article>
            ))}
          </Stack>
        )}
      </Section>

      <Section title={t('home.pendingGrades')}>
        {pending.length === 0 ? <p className="native-empty muted">{t('home.nonePending')}</p> : (
          <Stack>
            {pending.map((offering) => (
              <article key={offering.id} className="native-card">
                <div className="native-card-top">
                  <div>
                    <span className="native-code">{offering.code}</span>
                    <strong>{pick(offering.name_ar, offering.name_en)}</strong>
                  </div>
                  <Tag kind="warn">{offering.pending_grades}</Tag>
                </div>
                <Link className="b b-ghost" to={`/doctor/offerings/${offering.id}`}>{t('doc.gradesStudents')}</Link>
              </article>
            ))}
          </Stack>
        )}
      </Section>

      <Section title={t('home.sections')}>
        {data.length === 0 ? <p className="native-empty muted">{t('reg.none')}</p> : (
          <Stack>
            {data.map((offering) => (
              <article key={offering.id} className="native-card">
                <div className="native-card-top">
                  <div>
                    <span className="native-code">{offering.code}</span>
                    <strong>{pick(offering.name_ar, offering.name_en)}</strong>
                  </div>
                  {offering.open_session_id && <Tag kind="ok">{t('att.live')}</Tag>}
                </div>
                <p className="muted small">{t('col.students')}: {offering.enrolled_count}/{offering.capacity}</p>
                {Number(offering.pending_grades) > 0 && <p className="small"><Tag kind="warn">{t('col.pending')}: {offering.pending_grades}</Tag></p>}
                <Chips meetings={offering.meetings} />
                <div className="native-actions">
                  <Link className="b b-ghost" to={`/doctor/offerings/${offering.id}`}>{t('doc.gradesStudents')}</Link>
                  <button type="button" className="b b-primary" onClick={() => onStart(offering)}>
                    {offering.open_session_id ? t('doc.continueAtt') : t('doc.generateQr')}
                  </button>
                </div>
              </article>
            ))}
          </Stack>
        )}
      </Section>

      <Section title={t('nav.schedule')}>
        <DayAgenda items={items} />
      </Section>
    </Stack>
  );
}

export function AdminHomeNative({ data }) {
  const { t, pick } = useLanguage();
  return (
    <Stack>
      <section className="native-hero native-card">
        <h2 className="m0">{t('nav.dashboard')}</h2>
        <p className="muted">{t('admin.currentSemester')}: {data.semester ? pick(data.semester.name_ar, data.semester.name_en) : '—'}</p>
      </section>
      <div className="native-metrics">
        <Metric label={t('role.student')} value={data.students} />
        <Metric label={t('role.instructor')} value={data.instructors} />
        <Metric label={t('stat.courses')} value={data.courses} />
        <Metric label={t('stat.activeOfferings')} value={data.offerings} hint={data.semester ? pick(data.semester.name_ar, data.semester.name_en) : t('admin.currentSemester')} />
        <Metric label={t('stat.enrollments')} value={data.enrollments} hint={t('admin.currentSemester')} />
      </div>
      <div className="native-actions">
        <Link className="b b-primary" to="/admin/users">{t('nav.users')}</Link>
        <Link className="b b-ghost" to="/admin/catalog">{t('nav.manageCatalog')}</Link>
        <Link className="b b-ghost" to="/admin/offerings">{t('nav.offerings')}</Link>
        <Link className="b b-ghost" to="/catalog">{t('nav.catalog')}</Link>
      </div>
    </Stack>
  );
}
