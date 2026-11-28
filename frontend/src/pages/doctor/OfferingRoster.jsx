import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../../api/axios';
import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import { Alert, LoadError, Loading, Tag } from '../../components/ui';
import { useFeedback } from '../../context/FeedbackContext';
import { isNativeApp } from '../../native/platform';
import { errorText, gradeTotal } from '../../utils/format';
import { downloadFile } from '../../utils/download';

const KEYS = ['coursework', 'midterm', 'practical', 'final_exam'];

function CourseTools({ offeringId, onMessage }) {
  const { t } = useLanguage();
  const announcements = useFetch(`/instructor/offerings/${offeringId}/announcements`);
  const exams = useFetch(`/instructor/offerings/${offeringId}/exams`);
  const evaluation = useFetch(`/instructor/offerings/${offeringId}/evaluation`);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [examTitle, setExamTitle] = useState('');
  const [examAt, setExamAt] = useState('');
  const [limit, setLimit] = useState('');

  async function announce(e) {
    e.preventDefault();
    try {
      await api.post(`/instructor/offerings/${offeringId}/announcements`, { title, body });
      setTitle('');
      setBody('');
      announcements.reload();
      onMessage(t('ann.sent'), 'success');
    } catch (error) {
      onMessage(errorText(error, t), 'error');
    }
  }
  async function addExam(e) {
    e.preventDefault();
    try {
      await api.post(`/instructor/offerings/${offeringId}/exams`, { title: examTitle, exam_at: examAt });
      setExamTitle('');
      setExamAt('');
      exams.reload();
    } catch (error) {
      onMessage(errorText(error, t), 'error');
    }
  }
  async function saveLimit(e) {
    e.preventDefault();
    try {
      await api.put(`/attendance/offerings/${offeringId}/absence-limit`, { absence_limit_pct: limit === '' ? null : Number(limit) });
      onMessage(t('common.saved'), 'success');
    } catch (error) {
      onMessage(errorText(error, t), 'error');
    }
  }

  return (
    <div className="grid-2 gap-top">
      <form onSubmit={announce}>
        <h3 className="m0">{t('ann.title')}</h3>
        <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('ann.title')} />
        <textarea required value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('ann.body')} />
        <button className="b b-primary" type="submit">{t('ann.send')}</button>
        {(announcements.data || []).slice(0, 3).map((item) => <p key={item.id} className="small muted">{item.title}</p>)}
      </form>
      <div>
        <form onSubmit={addExam}>
          <h3 className="m0">{t('exam.add')}</h3>
          <input required value={examTitle} onChange={(e) => setExamTitle(e.target.value)} placeholder={t('exam.title')} />
          <input required type="datetime-local" value={examAt} onChange={(e) => setExamAt(e.target.value)} />
          <button className="b b-ghost" type="submit">{t('common.add')}</button>
        </form>
        {(exams.data || []).map((exam) => <p key={exam.id} className="small">{exam.title} · {String(exam.exam_at).replace('T', ' ').slice(0, 16)}</p>)}
        <form onSubmit={saveLimit} className="gap-top">
          <h3 className="m0">{t('att.limit')}</h3>
          <input value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="25" inputMode="numeric" />
          <button className="b b-ghost" type="submit">{t('common.save')}</button>
        </form>
        {evaluation.data && (
          <p className="small">{t('eval.average')}: {evaluation.data.average ?? '—'} · {t('eval.count')}: {evaluation.data.count}</p>
        )}
        <div className="row">
          <button type="button" className="b b-ghost" onClick={() => downloadFile(`/attendance/offerings/${offeringId}/report?format=xlsx`, 'absence.xlsx')}>{t('att.exportXlsx')}</button>
          <button type="button" className="b b-ghost" onClick={() => downloadFile(`/attendance/offerings/${offeringId}/report?format=pdf`, 'absence.pdf')}>{t('att.exportPdf')}</button>
        </div>
        {evaluation.data?.comments?.length > 0 && evaluation.data.comments.map((item, index) => (
          <p key={index} className="small muted">{item.rating}/5 {item.comment}</p>
        ))}
        {evaluation.data && evaluation.data.count > 0 && evaluation.data.count < 3 && <p className="small muted">{t('eval.hidden')}</p>}
      </div>
    </div>
  );
}

export default function OfferingRoster() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, pick } = useLanguage();
  const { data, error, loading, reload } = useFetch(`/instructor/offerings/${id}/roster`);
  const sessions = useFetch(`/attendance/offering/${id}/sessions`);
  const [edits, setEdits] = useState({});
  const [msg, setMsg] = useState(null);
  const { toast } = useFeedback();
  const [qrBusy, setQrBusy] = useState(null);

  async function openQr(sessionId) {
    setQrBusy(sessionId);
    try {
      await api.post(`/attendance/sessions/${sessionId}/qr`);
      navigate(`/doctor/attendance/${sessionId}`);
    } catch (e) {
      const text = errorText(e, t);
      setMsg({ type: 'error', text });
      toast({ type: 'error', message: text });
      setQrBusy(null);
    }
  }

  if (loading) return <Loading />;
  if (error || data == null) return <LoadError error={error} onRetry={reload} />;
  const { offering, max, students, total_sessions } = data;
  const hasPrac = !!offering.has_practical;
  const native = isNativeApp();
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
      const text = `${t('roster.saved')}: ${r.data.saved}`;
      setMsg({ type: 'success', text });
      toast({ type: 'success', message: text });
    } catch (e) {
      const text = errorText(e, t);
      setMsg({ type: 'error', text });
      toast({ type: 'error', message: text });
    }
  }

  async function publish() {
    setMsg(null);
    try {
      const r = await api.post(`/instructor/offerings/${id}/grades/publish`);
      reload();
      const text = `${t('roster.published')}: ${r.data.published} · ${t('roster.pending')}: ${r.data.pending}`;
      setMsg({ type: 'success', text });
      toast({ type: 'success', message: text });
    } catch (e) {
      const text = errorText(e, t);
      setMsg({ type: 'error', text });
      toast({ type: 'error', message: text });
    }
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
        <CourseTools offeringId={id} onMessage={(text, type) => { setMsg({ type, text }); toast({ type, message: text }); }} />

        {native ? (
          <div className="native-stack">
            {students.length === 0 && <p className="native-empty muted">{t('reg.none')}</p>}
            {students.map((s) => {
              const row = {};
              KEYS.forEach((k) => (row[k] = val(s, k)));
              const total = gradeTotal(row, hasPrac);
              return (
                <article key={s.enrollment_id} className="native-card">
                  <div className="native-card-top">
                    <div>
                      <strong>{pick(s.full_name_ar, s.full_name_en)}</strong>
                      <div className="muted small"><bdi>{s.student_code}</bdi> · {t('att.attended')} {s.attended}/{total_sessions}</div>
                    </div>
                    {s.published ? <Tag kind="ok">{t('roster.live')}</Tag> : <Tag kind="muted">{t('roster.draft')}</Tag>}
                  </div>
                  <div className="native-score-grid">
                    {KEYS.filter((k) => hasPrac || k !== 'practical').map((k) => (
                      <label key={k} className="field">
                        <span>{t(k === 'final_exam' ? 'grade.final' : k === 'coursework' ? 'grade.coursework' : k === 'midterm' ? 'grade.midterm' : 'grade.practical')} /{max[k]}</span>
                        <input className="num" type="number" min="0" max={max[k]} step="0.5" value={val(s, k)} onChange={(e) => edit(s, k, e.target.value)} />
                      </label>
                    ))}
                  </div>
                  <div className="native-card-top">
                    <span>{t('grade.total')}: <strong>{total ?? '—'}</strong></span>
                    <span>{t('grade.letter')}: {s.letter ?? '—'}</span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
        <div className="table-wrap">
          <table className="table grades-table table-cards">
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
                    <td className="card-title" data-label="ID"><bdi>{s.student_code}</bdi></td>
                    <td data-label={t('col.student')}>{pick(s.full_name_ar, s.full_name_en)}</td>
                    <td data-label={t('att.attended')}>{s.attended}/{total_sessions}</td>
                    {KEYS.filter((k) => hasPrac || k !== 'practical').map((k) => (
                      <td key={k} data-label={t(k === 'final_exam' ? 'grade.final' : k === 'coursework' ? 'grade.coursework' : k === 'midterm' ? 'grade.midterm' : 'grade.practical')}><input className="num" type="number" min="0" max={max[k]} step="0.5" value={val(s, k)} onChange={(e) => edit(s, k, e.target.value)} /></td>
                    ))}
                    <td data-label={t('grade.total')}><strong>{total ?? '—'}</strong></td>
                    <td data-label={t('grade.letter')}>{s.letter ?? '—'}</td>
                    <td data-label="">{s.published ? <Tag kind="ok">{t('roster.live')}</Tag> : <Tag kind="muted">{t('roster.draft')}</Tag>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
        <div className="toolbar">
          <button className="b b-primary" disabled={!dirty} onClick={save}>{t('roster.save')}</button>
          <button className="b b-ghost" disabled={dirty} onClick={publish}>{t('roster.publish')}</button>
        </div>
      </div>

      <div className="card gap-top">
        <h3 className="m0">{t('att.history')}</h3>
        {sessions.loading ? <Loading /> : sessions.error || sessions.data == null ? <LoadError error={sessions.error} onRetry={sessions.reload} /> : native ? (
          <div className="native-stack gap-top">
            {sessions.data.length === 0 && <p className="native-empty muted">{t('reg.none')}</p>}
            {sessions.data.map((s) => (
              <article key={s.id} className="native-card native-card-top">
                <div>
                  <strong>{s.session_date}</strong>
                  <div className="muted small">{t('att.attended')}: {s.present_count}</div>
                </div>
                {s.status === 'open' ? (
                  <button type="button" className="b b-primary" disabled={qrBusy === s.id} onClick={() => openQr(s.id)}>{t('doc.generateQr')}</button>
                ) : (
                  <Link to={`/doctor/attendance/${s.id}`}>{t('att.view')}</Link>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table table-cards">
              <thead><tr><th>#</th><th>{t('att.date')}</th><th>{t('att.attended')}</th><th /></tr></thead>
              <tbody>
                {sessions.data.length === 0 && <tr className="empty-row"><td colSpan={4} className="muted">{t('reg.none')}</td></tr>}
                {sessions.data.map((s) => (
                  <tr key={s.id}>
                    <td className="card-title" data-label="#">#{s.id}</td>
                    <td data-label={t('att.date')}>{s.session_date}</td>
                    <td data-label={t('att.attended')}>{s.present_count}</td>
                    <td data-label="" className="actions">
                      {s.status === 'open' ? (
                        <button className="b b-primary" disabled={qrBusy === s.id} onClick={() => openQr(s.id)}>{t('doc.generateQr')}</button>
                      ) : (
                        <Link to={`/doctor/attendance/${s.id}`}>{t('att.view')}</Link>
                      )}
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
