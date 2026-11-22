import { Fragment, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import { Loading, Tag } from '../../components/ui';

export default function Catalog() {
  const { t, pick } = useLanguage();
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [open, setOpen] = useState(null);
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (dept) params.set('department_id', dept);
  const courses = useFetch(`/courses?${params}`);
  const depts = useFetch('/departments');

  return (
    <div className="card">
      <h2 className="m0">{t('nav.catalog')}</h2>
      <div className="toolbar inline">
        <input placeholder={t('catalog.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">{t('catalog.allDepts')}</option>
          {(depts.data || []).map((d) => <option key={d.id} value={d.id}>{pick(d.name_ar, d.name_en)}</option>)}
        </select>
      </div>
      {courses.loading ? <Loading /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('col.code')}</th><th>{t('col.course')}</th><th>{t('col.department')}</th><th>{t('col.credits')}</th><th>{t('col.prereq')}</th></tr></thead>
            <tbody>
              {(courses.data || []).map((c) => (
                <Fragment key={c.id}>
                  <tr className="clickable" onClick={() => setOpen(open === c.id ? null : c.id)}>
                    <td><strong>{c.code}</strong></td>
                    <td>{pick(c.name_ar, c.name_en)}</td>
                    <td>{pick(c.department_ar, c.department_en)}</td>
                    <td>{c.credit_hours}{c.has_practical ? <Tag kind="info">{t('catalog.practical')}</Tag> : null}</td>
                    <td>{c.prerequisites.length ? c.prerequisites.map((p) => p.code).join(', ') : '—'}</td>
                  </tr>
                  {open === c.id && (
                    <tr>
                      <td colSpan={5} className="detail">
                        <p>{pick(c.description_ar, c.description_en) || '—'}</p>
                        {c.prerequisites.length > 0 && (
                          <p className="small"><strong>{t('col.prereq')}:</strong> {c.prerequisites.map((p) => `${p.code} ${pick(p.name_ar, p.name_en)}`).join(' · ')}</p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
