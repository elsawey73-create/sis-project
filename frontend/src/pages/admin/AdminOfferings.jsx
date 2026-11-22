import { useState } from 'react';
import api from '../../api/axios';
import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import { Alert, Field, Loading, Tag } from '../../components/ui';
import { DAYS, errorText, hhmm } from '../../utils/format';

const emptySem = { name_ar: '', name_en: '', start_date: '', end_date: '', registration_start: '', registration_end: '', is_current: false };
const emptyMeeting = { day_of_week: 'Sat', start_time: '09:00', end_time: '11:00', room: '', type: 'lecture' };

export default function AdminOfferings() {
  const { t, pick } = useLanguage();
  const sems = useFetch('/semesters');
  const [semId, setSemId] = useState('');
  const current = sems.data?.find((s) => s.is_current)?.id;
  const sid = semId || current || '';
  const offers = useFetch(sid ? `/offerings?semester_id=${sid}` : null);
  const courses = useFetch('/courses');
  const instructors = useFetch('/instructors');
  const [sem, setSem] = useState(null);
  const [semEdit, setSemEdit] = useState(null);
  const [off, setOff] = useState(null);
  const [offEdit, setOffEdit] = useState(null);
  const [msg, setMsg] = useState(null);

  async function run(fn) {
    setMsg(null);
    try { await fn(); sems.reload(); offers.reload(); setMsg({ type: 'success', text: t('common.saved') }); }
    catch (e) { setMsg({ type: 'error', text: errorText(e, t) }); }
  }

  const saveSem = (e) => { e.preventDefault(); run(async () => { if (semEdit) await api.put(`/semesters/${semEdit}`, sem); else await api.post('/semesters', sem); setSem(null); setSemEdit(null); }); };
  const saveOff = (e) => {
    e.preventDefault();
    run(async () => {
      const body = { ...off, semester_id: sid };
      if (offEdit) await api.put(`/offerings/${offEdit}`, body); else await api.post('/offerings', body);
      setOff(null); setOffEdit(null);
    });
  };
  const editOff = (o) => { setOffEdit(o.id); setOff({ course_id: o.course_id, instructor_id: o.instructor_id, section: o.section, capacity: o.capacity, meetings: o.meetings.map((m) => ({ ...m, start_time: hhmm(m.start_time), end_time: hhmm(m.end_time) })) }); };
  const setM = (i, k, v) => setOff({ ...off, meetings: off.meetings.map((m, j) => (j === i ? { ...m, [k]: v } : m)) });
  const setS = (k) => (e) => setSem({ ...sem, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  if (sems.loading) return <Loading />;

  return (
    <>
      <Alert type={msg?.type}>{msg?.text}</Alert>

      <div className="card">
        <div className="row between">
          <h3 className="m0">{t('admin.semesters')}</h3>
          {!sem && <button className="b b-primary" onClick={() => { setSemEdit(null); setSem(emptySem); }}>+ {t('common.add')}</button>}
        </div>
        {sem && (
          <form onSubmit={saveSem} className="form-grid">
            <Field label={t('form.nameAr')}><input required value={sem.name_ar} onChange={setS('name_ar')} /></Field>
            <Field label={t('form.nameEn')}><input required value={sem.name_en} onChange={setS('name_en')} /></Field>
            <Field label={t('sem.start')}><input required type="date" value={sem.start_date} onChange={setS('start_date')} /></Field>
            <Field label={t('sem.end')}><input required type="date" value={sem.end_date} onChange={setS('end_date')} /></Field>
            <Field label={t('sem.regStart')}><input required type="date" value={sem.registration_start} onChange={setS('registration_start')} /></Field>
            <Field label={t('sem.regEnd')}><input required type="date" value={sem.registration_end} onChange={setS('registration_end')} /></Field>
            <Field label={t('sem.current')}><input type="checkbox" checked={!!sem.is_current} onChange={setS('is_current')} /></Field>
            <div className="toolbar span-2">
              <button className="b b-primary">{t('common.save')}</button>
              <button type="button" className="b b-ghost" onClick={() => { setSem(null); setSemEdit(null); }}>{t('common.cancel')}</button>
            </div>
          </form>
        )}
        <table className="table">
          <thead><tr><th>{t('col.semester')}</th><th>{t('sem.regWindow')}</th><th /></tr></thead>
          <tbody>
            {sems.data.map((s) => (
              <tr key={s.id}>
                <td>{pick(s.name_ar, s.name_en)} {s.is_current ? <Tag kind="ok">{t('sem.current')}</Tag> : null}</td>
                <td className="small">{s.registration_start} → {s.registration_end} <Tag kind={s.registration_open ? 'ok' : 'muted'}>{s.registration_open ? t('reg.open') : t('reg.closed')}</Tag></td>
                <td><button className="b b-ghost" onClick={() => { setSemEdit(s.id); setSem({ ...s, is_current: !!s.is_current }); }}>{t('common.edit')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card gap-top">
        <div className="row between">
          <h3 className="m0">{t('nav.offerings')}</h3>
          <div className="toolbar inline m0">
            <select value={sid} onChange={(e) => setSemId(e.target.value)}>
              {sems.data.map((s) => <option key={s.id} value={s.id}>{pick(s.name_ar, s.name_en)}</option>)}
            </select>
            {!off && <button className="b b-primary" onClick={() => { setOffEdit(null); setOff({ course_id: '', instructor_id: '', section: '1', capacity: 40, meetings: [{ ...emptyMeeting }] }); }}>+ {t('common.add')}</button>}
          </div>
        </div>

        {off && (
          <form onSubmit={saveOff} className="form-grid">
            <Field label={t('col.course')}>
              <select required value={off.course_id} onChange={(e) => setOff({ ...off, course_id: e.target.value })}>
                <option value="">—</option>
                {(courses.data || []).map((c) => <option key={c.id} value={c.id}>{c.code} — {pick(c.name_ar, c.name_en)}</option>)}
              </select>
            </Field>
            <Field label={t('col.instructor')}>
              <select required value={off.instructor_id} onChange={(e) => setOff({ ...off, instructor_id: e.target.value })}>
                <option value="">—</option>
                {(instructors.data || []).map((i) => <option key={i.id} value={i.id}>{i.login_id} — {pick(i.full_name_ar, i.full_name_en)}</option>)}
              </select>
            </Field>
            <Field label={t('off.section')}><input required value={off.section} onChange={(e) => setOff({ ...off, section: e.target.value })} /></Field>
            <Field label={t('off.capacity')}><input required type="number" min="1" value={off.capacity} onChange={(e) => setOff({ ...off, capacity: e.target.value })} /></Field>
            <div className="span-2">
              <strong className="small">{t('col.schedule')}</strong>
              {off.meetings.map((m, i) => (
                <div key={i} className="toolbar inline">
                  <select value={m.day_of_week} onChange={(e) => setM(i, 'day_of_week', e.target.value)}>{DAYS.map((d) => <option key={d} value={d}>{t('day.' + d)}</option>)}</select>
                  <input type="time" value={m.start_time} onChange={(e) => setM(i, 'start_time', e.target.value)} />
                  <input type="time" value={m.end_time} onChange={(e) => setM(i, 'end_time', e.target.value)} />
                  <input placeholder={t('off.room')} value={m.room} onChange={(e) => setM(i, 'room', e.target.value)} />
                  <select value={m.type} onChange={(e) => setM(i, 'type', e.target.value)}>{['lecture', 'section', 'lab'].map((x) => <option key={x} value={x}>{t('type.' + x)}</option>)}</select>
                  <button type="button" className="btn-small" onClick={() => setOff({ ...off, meetings: off.meetings.filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
              <button type="button" className="b b-ghost" onClick={() => setOff({ ...off, meetings: [...off.meetings, { ...emptyMeeting }] })}>+ {t('off.addMeeting')}</button>
            </div>
            <div className="toolbar span-2">
              <button className="b b-primary">{t('common.save')}</button>
              <button type="button" className="b b-ghost" onClick={() => { setOff(null); setOffEdit(null); }}>{t('common.cancel')}</button>
            </div>
          </form>
        )}

        {offers.loading ? <Loading /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('col.code')}</th><th>{t('col.course')}</th><th>{t('off.section')}</th><th>{t('col.instructor')}</th><th>{t('col.schedule')}</th><th>{t('col.seats')}</th><th /></tr></thead>
              <tbody>
                {(offers.data || []).map((o) => (
                  <tr key={o.id}>
                    <td><strong>{o.code}</strong></td><td>{pick(o.name_ar, o.name_en)}</td><td>{o.section}</td>
                    <td>{pick(o.instructor_ar, o.instructor_en)}</td>
                    <td className="small">{o.meetings.map((m) => `${t('day.' + m.day_of_week)} ${hhmm(m.start_time)}–${hhmm(m.end_time)} (${m.room})`).join(' | ')}</td>
                    <td>{o.enrolled_count}/{o.capacity}</td>
                    <td className="actions">
                      <button className="b b-ghost" onClick={() => editOff(o)}>{t('common.edit')}</button>
                      <button className="btn-small" onClick={() => confirm(t('common.confirm')) && run(() => api.delete(`/offerings/${o.id}`))}>{t('common.delete')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
