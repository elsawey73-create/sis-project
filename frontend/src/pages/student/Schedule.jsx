import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import WeeklySchedule from '../../components/WeeklySchedule';
import { LoadError, Loading } from '../../components/ui';
import DayAgenda from '../../native/DayAgenda';
import { isNativeApp } from '../../native/platform';

export default function Schedule() {
  const { t, pick } = useLanguage();
  const { data, error, loading, reload } = useFetch('/enrollments/me');
  if (loading) return <Loading />;
  if (error || data == null) return <LoadError error={error} onRetry={reload} />;
  const items = data.courses.flatMap((c) => c.meetings.map((m) => ({ ...m, code: c.code, name_ar: c.name_ar, name_en: c.name_en })));
  if (isNativeApp()) {
    return (
      <div className="native-stack">
        {data.semester && <p className="muted">{pick(data.semester.name_ar, data.semester.name_en)}</p>}
        {items.length === 0 ? <p className="native-empty muted">{t('reg.none')}</p> : <DayAgenda items={items} />}
      </div>
    );
  }
  return (
    <div className="card">
      <h2 className="m0">{t('nav.schedule')}{data.semester && ` — ${pick(data.semester.name_ar, data.semester.name_en)}`}</h2>
      {items.length === 0 ? <p className="muted">{t('reg.none')}</p> : <WeeklySchedule items={items} />}
    </div>
  );
}
