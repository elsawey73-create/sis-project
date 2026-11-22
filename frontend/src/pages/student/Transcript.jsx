import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import Brand from '../../components/Brand';
import { Loading } from '../../components/ui';

export default function Transcript() {
  const { t, pick } = useLanguage();
  const { data, loading } = useFetch('/student/transcript');
  if (loading || !data) return <Loading />;
  const { student: s, semesters, standing } = data;

  return (
    <div className="card transcript">
      <div className="row between no-print">
        <h2 className="m0">{t('nav.transcript')}</h2>
        <button className="b b-primary" onClick={() => window.print()}>🖨️ {t('transcript.print')}</button>
      </div>

      <div className="print-head">
        <Brand large />
        <h2>{t('transcript.title')}</h2>
      </div>
      <div className="grid-2 gap-top">
        <div><span className="muted">{t('transcript.name')}:</span> <strong>{pick(s.full_name_ar, s.full_name_en)}</strong></div>
        <div><span className="muted">{t('student.code')}:</span> <bdi>{s.student_code}</bdi></div>
        <div><span className="muted">{t('student.department')}:</span> {pick(s.department_ar, s.department_en)}</div>
        <div><span className="muted">{t('transcript.level')}:</span> {s.level} · {s.admission_year}</div>
      </div>

      {semesters.length === 0 && <p className="muted">{t('grades.none')}</p>}
      {semesters.map((sem) => (
        <div key={sem.id} className="gap-top avoid-break">
          <h3 className="m0">{pick(sem.name_ar, sem.name_en)}</h3>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('col.code')}</th><th>{t('col.course')}</th><th>{t('col.credits')}</th><th>{t('grade.total')}</th><th>{t('grade.letter')}</th><th>{t('grade.points')}</th></tr></thead>
              <tbody>
                {sem.courses.map((c) => (
                  <tr key={c.code}>
                    <td><strong>{c.code}</strong></td><td>{pick(c.name_ar, c.name_en)}</td><td>{c.credit_hours}</td>
                    <td>{c.total}</td><td>{c.letter}</td><td>{Number(c.points).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small">
            {t('transcript.semGpa')}: <strong>{sem.gpa?.toFixed(2)}</strong> · {t('transcript.attempted')}: {sem.credits_attempted} · {t('transcript.earned')}: {sem.credits_earned}
          </p>
        </div>
      ))}

      <div className="summary-box gap-top">
        <div>{t('stat.cgpa')}: <strong>{standing.cgpa?.toFixed(2) ?? '—'}</strong></div>
        <div>{t('transcript.attempted')}: <strong>{standing.credits_attempted}</strong></div>
        <div>{t('transcript.earned')}: <strong>{standing.credits_earned}</strong></div>
      </div>
    </div>
  );
}
