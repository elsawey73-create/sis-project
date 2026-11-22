import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import WeeklySchedule from '../../components/WeeklySchedule';
import { Loading } from '../../components/ui';

export default function Schedule() {
  const { t, pick } = useLanguage();
  const { data, loading } = useFetch('/enrollments/me');
  if (loading || !data) return <Loading />;
  const items = data.courses.flatMap((c) => c.meetings.map((m) => ({ ...m, code: c.code, name_ar: c.name_ar, name_en: c.name_en })));
  return (
    <div className="card">
      <h2 className="m0">{t('nav.schedule')}{data.semester && ` — ${pick(data.semester.name_ar, data.semester.name_en)}`}</h2>
      {items.length === 0 ? <p className="muted">{t('reg.none')}</p> : <WeeklySchedule items={items} />}
    </div>
  );
}
