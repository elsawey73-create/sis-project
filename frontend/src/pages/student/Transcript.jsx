import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import Brand from '../../components/Brand';
import { DataTable, EmptyState, LoadError, Loading, Tag } from '../../components/ui';
import { downloadFile } from '../../utils/download';
import { isNativeApp } from '../../native/platform';
import { TranscriptNative } from '../../native/views';

export default function Transcript() {
  const { t, pick } = useLanguage();
  const { data, error, loading, reload } = useFetch('/student/transcript');
  if (loading) return <Loading />;
  if (error || data == null) return <LoadError error={error} onRetry={reload} />;
  const { student: s, semesters, standing } = data;
  if (isNativeApp()) return <TranscriptNative data={data} />;

  return (
    <div className="card transcript">
      <div className="row between no-print">
        <h2 className="m0">{t('nav.transcript')}</h2>
        <div className="row">
          <button className="b b-ghost" onClick={() => downloadFile('/student/transcript.pdf', 'transcript.pdf')}>{t('export.transcript')}</button>
          <button className="b b-ghost" onClick={() => downloadFile('/student/export.xlsx', 'unidex-record.xlsx')}>{t('export.record')}</button>
          <button className="b b-primary" onClick={() => window.print()}>🖨️ {t('transcript.print')}</button>
        </div>
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

      {semesters.length === 0 && <EmptyState title={t('grades.none')} />}
      {semesters.map((sem) => (
        <div key={sem.id} className="gap-top avoid-break">
          <h3 className="m0">{pick(sem.name_ar, sem.name_en)}</h3>
          <DataTable
            rowKey={(c) => c.enrollment_id}
            rowClass={(c) => (c.replaced ? 'replaced' : undefined)}
            rows={sem.courses}
            columns={[
              { key: 'code', label: t('col.code'), render: (c) => <strong>{c.code}</strong> },
              { key: 'course', label: t('col.course'), render: (c) => <>{pick(c.name_ar, c.name_en)} {c.replaced && <Tag kind="muted">{t('grade.replaced')}</Tag>}</> },
              { key: 'credits', label: t('col.credits'), render: (c) => c.credit_hours },
              { key: 'total', label: t('grade.total'), render: (c) => c.total },
              { key: 'letter', label: t('grade.letter'), render: (c) => c.letter },
              { key: 'points', label: t('grade.points'), render: (c) => Number(c.points).toFixed(1) },
            ]}
          />
          <p className="small">
            {t('transcript.semGpa')}: <strong>{sem.gpa?.toFixed(2)}</strong> · {t('transcript.attempted')}: {sem.credits_attempted} · {t('transcript.earned')}: {sem.credits_earned}
          </p>
        </div>
      ))}

      {semesters.some((sem) => sem.courses.some((c) => c.replaced)) && (
        <p className="small muted gap-top">{t('transcript.repeatNote')}</p>
      )}

      <div className="summary-box gap-top">
        <div>{t('stat.cgpa')}: <strong>{standing.cgpa?.toFixed(2) ?? '—'}</strong></div>
        <div>{t('transcript.attempted')}: <strong>{standing.credits_attempted}</strong></div>
        <div>{t('transcript.earned')}: <strong>{standing.credits_earned}</strong></div>
      </div>
    </div>
  );
}
