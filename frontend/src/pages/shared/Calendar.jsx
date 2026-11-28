import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import { LoadError, Loading, Tag } from '../../components/ui';
import { hhmm } from '../../utils/format';

const DAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'];

export default function Calendar() {
  const { t, pick } = useLanguage();
  const { data, error, loading, reload } = useFetch('/calendar');
  if (loading) return <Loading />;
  if (error || data == null) return <LoadError error={error} onRetry={reload} />;
  const events = data.events || [];
  const exams = events.filter((event) => event.type === 'exam');
  const meetings = events.filter((event) => event.type === 'meeting');
  const markers = events.filter((event) => event.type === 'registration' || event.type === 'term');

  return (
    <div className="card">
      <h2 className="m0">{t('cal.title')}</h2>
      {data.semester && <p className="muted">{pick(data.semester.name_ar, data.semester.name_en)}</p>}
      {events.length === 0 && <p className="muted">{t('cal.none')}</p>}
      <div className="stack">
        {markers.map((event) => (
          <p key={event.type}><Tag kind="info">{t('cal.' + event.type)}</Tag> {String(event.start).slice(0, 10)} – {String(event.end).slice(0, 10)}</p>
        ))}
      </div>
      <h3>{t('cal.exams')}</h3>
      {exams.length === 0 ? <p className="muted">{t('exam.none')}</p> : exams.map((exam) => (
        <article key={exam.id} className="att-card">
          <strong>{exam.code}</strong> {exam.title}
          <div className="muted small">{String(exam.start).replace('T', ' ').slice(0, 16)} · {pick(exam.name_ar, exam.name_en)}</div>
        </article>
      ))}
      <h3>{t('cal.meetings')}</h3>
      <div className="cal-grid gap-top">
        {DAYS.map((day) => (
          <div key={day} className="cal-day">
            <strong>{t('day.' + day)}</strong>
            {meetings.filter((meeting) => meeting.day_of_week === day).map((meeting) => (
              <div key={meeting.id} className="small">{meeting.code} {hhmm(meeting.start_time)}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
