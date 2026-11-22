import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import { Loading } from '../../components/ui';

export default function Grades() {
  const { t, pick } = useLanguage();
  const { data, loading } = useFetch('/student/grades');
  if (loading || !data) return <Loading />;
  if (data.length === 0) return <div className="card"><p className="muted">{t('grades.none')}</p></div>;

  const groups = [];
  data.forEach((r) => {
    let g = groups.find((x) => x.id === r.semester_id);
    if (!g) groups.push((g = { id: r.semester_id, ar: r.semester_ar, en: r.semester_en, rows: [] }));
    g.rows.push(r);
  });

  return groups.map((g) => (
    <div className="card gap-bottom" key={g.id}>
      <h3 className="m0">{pick(g.ar, g.en)}</h3>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('col.course')}</th><th>{t('grade.coursework')}</th><th>{t('grade.midterm')}</th>
              <th>{t('grade.practical')}</th><th>{t('grade.final')}</th><th>{t('grade.total')}</th><th>{t('grade.letter')}</th>
            </tr>
          </thead>
          <tbody>
            {g.rows.map((r) => (
              <tr key={r.code}>
                <td><strong>{r.code}</strong> {pick(r.name_ar, r.name_en)}</td>
                <td>{r.coursework}/{r.max.coursework}</td>
                <td>{r.midterm}/{r.max.midterm}</td>
                <td>{r.has_practical ? `${r.practical}/${r.max.practical}` : '—'}</td>
                <td>{r.final_exam}/{r.max.final_exam}</td>
                <td><strong>{r.total}</strong></td>
                <td><span className={`tag ${r.points > 0 ? 'tag-ok' : 'tag-err'}`}>{r.letter}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ));
}
