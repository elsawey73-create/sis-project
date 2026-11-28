import { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import { useCachedFetch } from '../../utils/offlineCache';
import WeeklySchedule from '../../components/WeeklySchedule';
import { Alert, LoadError, Loading } from '../../components/ui';
import { downloadFile } from '../../utils/download';
import DayAgenda from '../../native/DayAgenda';
import { isNativeApp } from '../../native/platform';

export default function Schedule() {
  const { t, pick } = useLanguage();
  const terms = useFetch('/student/terms');
  const [semesterId, setSemesterId] = useState('');
  const path = semesterId ? `/enrollments/me?semester_id=${semesterId}` : '/enrollments/me';
  const { data, error, loading, reload, offline } = useCachedFetch(path, semesterId ? `schedule-${semesterId}` : 'schedule');
  if (loading) return <Loading />;
  if (error || data == null) return <LoadError error={error} onRetry={reload} />;
  const items = data.courses.flatMap((c) => c.meetings.map((m) => ({
    ...m, code: c.code, section: c.section, name_ar: c.name_ar, name_en: c.name_en,
  })));
  if (isNativeApp()) {
    return (
      <div className="native-stack">
        {data.semester && <p className="muted">{pick(data.semester.name_ar, data.semester.name_en)}</p>}
        {offline && <Alert type="info">{t('offline.banner')}</Alert>}
        <div className="row">
          <button type="button" className="b b-ghost" onClick={() => downloadFile('/enrollments/me/schedule.ics', 'schedule.ics')}>{t('export.scheduleIcs')}</button>
          <button type="button" className="b b-ghost" onClick={() => downloadFile('/enrollments/me/schedule.pdf', 'schedule.pdf')}>{t('export.schedulePdf')}</button>
        </div>
        {items.length === 0 ? <p className="native-empty muted">{t('reg.none')}</p> : <DayAgenda items={items} />}
      </div>
    );
  }
  return (
    <div className="card">
      <div className="row between">
        <h2 className="m0">{t('nav.schedule')}{data.semester && ` — ${pick(data.semester.name_ar, data.semester.name_en)}`}</h2>
        <div className="row">
          <select value={semesterId} onChange={(e) => setSemesterId(e.target.value)} aria-label={t('col.semester')}>
            <option value="">{t('term.current')}</option>
            {(terms.data || []).map((term) => <option key={term.id} value={term.id}>{pick(term.name_ar, term.name_en)}</option>)}
          </select>
          <button type="button" className="b b-ghost" onClick={() => downloadFile(`/enrollments/me/schedule.pdf${semesterId ? `?semester_id=${semesterId}` : ''}`, 'schedule.pdf')}>{t('export.schedulePdf')}</button>
          <button type="button" className="b b-ghost" onClick={() => downloadFile(`/enrollments/me/schedule.ics${semesterId ? `?semester_id=${semesterId}` : ''}`, 'schedule.ics')}>{t('export.scheduleIcs')}</button>
        </div>
      </div>
      {offline && <Alert type="info">{t('offline.banner')}</Alert>}
      {items.length === 0 ? <p className="muted">{t('reg.none')}</p> : <WeeklySchedule items={items} />}
    </div>
  );
}
