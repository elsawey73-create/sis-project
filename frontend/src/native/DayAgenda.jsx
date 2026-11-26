import { useLanguage } from '../context/LanguageContext';
import { DAYS, hhmm } from '../utils/format';

const FROM_JS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function teachingDay() {
  return FROM_JS[new Date().getDay()];
}

// One card per teaching day, instead of the website's six-column week grid.
export default function DayAgenda({ items }) {
  const { t, pick } = useLanguage();
  const today = teachingDay();
  const groups = DAYS.map((day) => ({
    day,
    list: items.filter((item) => item.day_of_week === day).sort((a, b) => (a.start_time < b.start_time ? -1 : 1)),
  })).filter((group) => group.list.length);

  if (groups.length === 0) return <p className="native-empty muted">{t('home.noMeetings')}</p>;

  return (
    <div className="native-stack">
      {groups.map((group) => (
        <section key={group.day} className={`native-day native-card${group.day === today ? ' is-today' : ''}`}>
          <header className="native-card-top">
            <h3 className="m0">{t(`day.${group.day}`)}</h3>
            {group.day === today && <span className="tag tag-info">{t('native.today')}</span>}
          </header>
          {group.list.map((item, index) => (
            <article key={`${item.code}-${item.start_time}-${index}`} className={`native-slot slot-${item.type || 'lecture'}`}>
              <div className="native-slot-time">
                <strong><bdi>{hhmm(item.start_time)}</bdi></strong>
                <span>{hhmm(item.end_time)}</span>
              </div>
              <div>
                <strong>{item.code}</strong>
                <div>{pick(item.name_ar, item.name_en)}</div>
                <div className="muted small">{item.room} · {t(`type.${item.type}`)}</div>
              </div>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
