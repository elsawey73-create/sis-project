import { useLanguage } from '../context/LanguageContext';
import { DAYS, hhmm } from '../utils/format';

// items: [{ day_of_week, start_time, end_time, room, type, code, name_ar, name_en }]
export default function WeeklySchedule({ items }) {
  const { t, pick } = useLanguage();
  return (
    <div className="week">
      {DAYS.map((d) => {
        const list = items.filter((i) => i.day_of_week === d).sort((a, b) => (a.start_time < b.start_time ? -1 : 1));
        return (
          <div key={d} className="week-day">
            <div className="week-head">{t('day.' + d)}</div>
            {list.length === 0 && <div className="muted small">—</div>}
            {list.map((i, idx) => (
              <div key={idx} className={`slot slot-${i.type}`}>
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
