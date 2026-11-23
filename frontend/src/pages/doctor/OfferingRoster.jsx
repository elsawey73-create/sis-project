import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/axios';
import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import { Alert, LoadError, Loading, Tag } from '../../components/ui';
import { errorText, gradeTotal } from '../../utils/format';

const KEYS = ['coursework', 'midterm', 'practical', 'final_exam'];

export default function OfferingRoster() {
  const { id } = useParams();
  const { t, pick } = useLanguage();
  const { data, error, loading, reload } = useFetch(`/instructor/offerings/${id}/roster`);
  const sessions = useFetch(`/attendance/offering/${id}/sessions`);
  const [edits, setEdits] = useState({});
  const [msg, setMsg] = useState(null);

  if (loading) return <Loading />;
  if (error || data == null) return <LoadError error={error} onRetry={reload} />;
  const { offering, max, students, total_sessions } = data;
  const hasPrac = !!offering.has_practical;
  const val = (s, k) => edits[s.enrollment_id]?.[k] ?? s[k] ?? '';
  const edit = (s, k, v) => setEdits({ ...edits, [s.enrollment_id]: { ...edits[s.enrollment_id], [k]: v } });
  const dirty = Object.keys(edits).length > 0;

  async function save() {
    setMsg(null);
    try {
      const grades = Object.keys(edits).map((eid) => {
        const s = students.find((x) => String(x.enrollment_id) === eid);
        const row = { enrollment_id: s.enrollment_id };
        KEYS.forEach((k) => (row[k] = val(s, k) === '' ? null : Number(val(s, k))));
        return row;
      });
      const r = await api.put(`/instructor/offerings/${id}/grades`, { grades });
      setEdits({});
      reload();
      setMsg({ type: 'success', text: `${t('roster.saved')}: ${r.data.saved}` });
    } catch (e) { setMsg({ type: 'error', text: errorText(e, t) }); }
  }

  async function publish() {
    setMsg(null);
    try {
      const r = await api.post(`/instructor/offerings/${id}/grades/publish`);
      reload();
      setMsg({ type: 'success', text: `${t('roster.published')}: ${r.data.published} · ${t('roster.pending')}: ${r.data.pending}` });
    } catch (e) { setMsg({ type: 'error', text: errorText(e, t) }); }
  }

  return (
    <>
      <div className="card">
        <div className="row between">
          <h2 className="m0">{offering.code} — {pick(offering.name_ar, offering.name_en)}</h2>
          <Link to="/doctor">← {t('nav.myCourses')}</Link>
        </div>
        <Alert type={msg?.type}>{msg?.text}</Alert>
        <p className="muted small">{t('roster.hint')}</p>

        <div className="table-wrap">
          <table className="table grades-table">
            <thead>
              <tr>
                <th>ID</th><th>{t('col.student')}</th><th>{t('att.attended')} ({total_sessions})</th>
                <th>{t('grade.coursework')} /{max.coursework}</th><th>{t('grade.midterm')} /{max.midterm}</th>
                {hasPrac && <th>{t('grade.practical')} /{max.practical}</th>}
                <th>{t('grade.final')} /{max.final_exam}</th><th>{t('grade.total')}</th><th>{t('grade.letter')}</th><th />
              </tr>
            </thead>
            <tbody>
              {students.length === 0 && <tr><td colSpan={10} className="muted">{t('reg.none')}</td></tr>}
              {students.map((s) => {
                const row = {}; KEYS.forEach((k) => (row[k] = val(s, k)));
                const total = gradeTotal(row, hasPrac);
                return (
                  <tr key={s.enrollment_id}>
                    <td><bdi>{s.student_code}</bdi></td>
                    <td>{pick(s.full_name_ar, s.full_name_en)}</td>
                    <td>{s.attended}/{total_sessions}</td>
                    {KEYS.filter((k) => hasPrac || k !== 'practical').map((k) => (
                      <td key={k}><input className="num" type="number" min="0" max={max[k]} step="0.5" value={val(s, k)} onChange={(e) => edit(s, k, e.target.value)} /></td>
                    ))}
                    <td><strong>{total ?? '—'}</strong></td>
                    <td>{s.letter ?? '—'}</td>
                    <td>{s.published ? <Tag kind="ok">{t('roster.live')}</Tag> : <Tag kind="muted">{t('roster.draft')}</Tag>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="toolbar">
          <button className="b b-primary" disabled={!dirty} onClick={save}>{t('roster.save')}</button>
          <button className="b b-ghost" disabled={dirty} onClick={publish}>{t('roster.publish')}</button>
        </div>
      </div>

      <div className="card gap-top">
        <h3 className="m0">{t('att.history')}</h3>
        {sessions.loading ? <Loading /> : sessions.error || sessions.data == null ? <LoadError error={sessions.error} onRetry={sessions.reload} /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>#</th><th>{t('att.date')}</th><th>{t('att.attended')}</th><th /></tr></thead>
              <tbody>
                {sessions.data.length === 0 && <tr><td colSpan={4} className="muted">{t('reg.none')}</td></tr>}
                {sessions.data.map((s) => (
                  <tr key={s.id}>
                    <td>{s.id}</td><td>{s.session_date}</td><td>{s.present_count}</td>
                    <td><Link to={`/doctor/attendance/${s.id}`}>{s.status === 'open' ? t('att.live') : t('att.view')}</Link></td>
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
