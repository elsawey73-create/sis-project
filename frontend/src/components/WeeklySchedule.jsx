import { useLanguage } from '../context/LanguageContext';
import { hhmm } from '../utils/format';
import { SCHEDULE_DAYS, courseColorClass } from '../utils/schedule';

// items: [{ day_of_week, start_time, end_time, room, type, code, section, name_ar, name_en }]
// Saturday meetings are not rendered. The week is Sunday through Thursday.
export default function WeeklySchedule({ items }) {
  const { t, pick } = useLanguage();
  return (
    <div className="week">
      {SCHEDULE_DAYS.map((d) => {
        const list = items.filter((i) => i.day_of_week === d).sort((a, b) => (a.start_time < b.start_time ? -1 : 1));
        return (
          <div key={d} className="week-day">
            <div className="week-head">{t('day.' + d)}</div>
            {list.length === 0 && <div className="muted small">—</div>}
            {list.map((i, idx) => (
              <div key={idx} className={`slot ${courseColorClass(i)}`}>
                <strong>{i.code}</strong>
                <div className="small">{pick(i.name_ar, i.name_en)}</div>
                <div className="small">{hhmm(i.start_time)}–{hhmm(i.end_time)} · {i.room}</div>
                <div className="small muted">{t('type.' + i.type)}</div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
