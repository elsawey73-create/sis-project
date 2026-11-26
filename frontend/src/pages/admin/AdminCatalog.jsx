import { useState } from 'react';
import api from '../../api/axios';
import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import { Alert, Field, LoadError, Loading } from '../../components/ui';
import { useFeedback } from '../../context/FeedbackContext';
import { errorText } from '../../utils/format';

const emptyCourse = { code: '', name_ar: '', name_en: '', description_ar: '', description_en: '', credit_hours: 3, department_id: '', has_practical: false, prerequisites: [] };
const emptyDept = { code: '', name_ar: '', name_en: '' };

export default function AdminCatalog() {
  const { t, pick } = useLanguage();
  const depts = useFetch('/departments');
  const courses = useFetch('/courses');
  const [dept, setDept] = useState(emptyDept);
  const [course, setCourse] = useState(null); // null hides the editor.
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState(null);
  const { confirm, toast } = useFeedback();

  async function run(fn) {
    setMsg(null);
    try {
      await fn();
      depts.reload();
      courses.reload();
      const text = t('common.saved');
      setMsg({ type: 'success', text });
      toast({ type: 'success', message: text });
    } catch (e) {
      const text = errorText(e, t);
      setMsg({ type: 'error', text });
      toast({ type: 'error', message: text });
    }
  }

  async function remove(url) {
    const ok = await confirm({ message: t('common.confirm'), confirmLabel: t('common.delete'), danger: true });
    if (ok) run(() => api.delete(url));
  }

  const saveDept = (e) => { e.preventDefault(); run(async () => { await api.post('/departments', dept); setDept(emptyDept); }); };
  const saveCourse = (e) => {
    e.preventDefault();
    run(async () => {
      if (editId) await api.put(`/courses/${editId}`, course); else await api.post('/courses', course);
      setCourse(null); setEditId(null);
    });
  };
  const editCourse = (c) => { setEditId(c.id); setCourse({ ...c, prerequisites: c.prerequisites.map((p) => p.id), has_practical: !!c.has_practical }); };
  const togglePre = (cid) => setCourse({ ...course, prerequisites: course.prerequisites.includes(cid) ? course.prerequisites.filter((x) => x !== cid) : [...course.prerequisites, cid] });
  const set = (k) => (e) => setCourse({ ...course, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  if (depts.loading || courses.loading) return <Loading />;
  if (depts.error || courses.error || depts.data == null || courses.data == null) {
    return <LoadError error={depts.error || courses.error} onRetry={() => { depts.reload(); courses.reload(); }} />;
  }

  return (
    <>
      <Alert type={msg?.type}>{msg?.text}</Alert>

      <div className="card">
        <h3 className="m0">{t('admin.departments')}</h3>
        <div className="table-wrap">
        <table className="table">
          <tbody>
            {depts.data.length === 0 && <tr><td className="muted">{t('reg.none')}</td></tr>}
            {depts.data.map((d) => (
              <tr key={d.id}>
                <td><strong>{d.code}</strong></td><td>{d.name_ar}</td><td>{d.name_en}</td>
                <td><button type="button" className="btn-small" onClick={() => remove(`/departments/${d.id}`)}>{t('common.delete')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <form className="toolbar inline" onSubmit={saveDept}>
          <input required placeholder="CS" value={dept.code} onChange={(e) => setDept({ ...dept, code: e.target.value })} />
          <input required placeholder={t('form.nameAr')} value={dept.name_ar} onChange={(e) => setDept({ ...dept, name_ar: e.target.value })} />
          <input required placeholder={t('form.nameEn')} value={dept.name_en} onChange={(e) => setDept({ ...dept, name_en: e.target.value })} />
          <button className="b b-primary">{t('common.add')}</button>
        </form>
      </div>

      <div className="card gap-top">
        <div className="row between">
          <h3 className="m0">{t('admin.courses')}</h3>
          {!course && <button className="b b-primary" onClick={() => { setEditId(null); setCourse(emptyCourse); }}>+ {t('common.add')}</button>}
        </div>

        {course && (
          <form onSubmit={saveCourse} className="form-grid">
            <Field label={t('col.code')}><input required value={course.code} onChange={set('code')} /></Field>
            <Field label={t('col.credits')}><input required type="number" min="1" max="6" value={course.credit_hours} onChange={set('credit_hours')} /></Field>
            <Field label={t('form.nameAr')}><input required value={course.name_ar} onChange={set('name_ar')} /></Field>
            <Field label={t('form.nameEn')}><input required value={course.name_en} onChange={set('name_en')} /></Field>
            <Field label={t('col.department')}>
              <select required value={course.department_id} onChange={set('department_id')}>
                <option value="">—</option>
                {depts.data.map((d) => <option key={d.id} value={d.id}>{pick(d.name_ar, d.name_en)}</option>)}
              </select>
            </Field>
            <Field label={t('catalog.practical')}><input type="checkbox" checked={course.has_practical} onChange={set('has_practical')} /></Field>
            <Field label={t('form.descAr')}><textarea rows={2} value={course.description_ar || ''} onChange={set('description_ar')} /></Field>
            <Field label={t('form.descEn')}><textarea rows={2} value={course.description_en || ''} onChange={set('description_en')} /></Field>
            <div className="span-2">
              <strong className="small">{t('col.prereq')}</strong>
              <div className="checks">
                {courses.data.filter((c) => c.id !== editId).map((c) => (
                  <label key={c.id} className="check"><input type="checkbox" checked={course.prerequisites.includes(c.id)} onChange={() => togglePre(c.id)} /> {c.code}</label>
                ))}
              </div>
            </div>
            <div className="toolbar span-2">
              <button className="b b-primary">{t('common.save')}</button>
              <button type="button" className="b b-ghost" onClick={() => { setCourse(null); setEditId(null); }}>{t('common.cancel')}</button>
            </div>
          </form>
        )}

        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('col.code')}</th><th>{t('col.course')}</th><th>{t('col.credits')}</th><th>{t('col.prereq')}</th><th /></tr></thead>
            <tbody>
              {courses.data.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.code}</strong></td><td>{pick(c.name_ar, c.name_en)}</td><td>{c.credit_hours}</td>
                  <td>{c.prerequisites.map((p) => p.code).join(', ') || '—'}</td>
                  <td className="actions">
                    <button className="b b-ghost" onClick={() => editCourse(c)}>{t('common.edit')}</button>
                    <button type="button" className="btn-small" onClick={() => remove(`/courses/${c.id}`)}>{t('common.delete')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
