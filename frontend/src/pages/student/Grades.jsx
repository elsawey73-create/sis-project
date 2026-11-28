import { useState } from 'react';
import api from '../../api/axios';
import { useLanguage } from '../../context/LanguageContext';
import { useFeedback } from '../../context/FeedbackContext';
import useFetch from '../../hooks/useFetch';
import { useCachedFetch } from '../../utils/offlineCache';
import { Alert, DataTable, EmptyState, LoadError, Loading, Tag } from '../../components/ui';
import { downloadFile } from '../../utils/download';
import { errorText } from '../../utils/format';
import { isNativeApp } from '../../native/platform';
import { GradesNative } from '../../native/views';

export default function Grades() {
  const { t, pick } = useLanguage();
  const { data, error, loading, reload, offline } = useCachedFetch('/student/grades', 'grades');
  if (loading) return <Loading />;
  if (error || data == null) return <LoadError error={error} onRetry={reload} />;

  const groups = [];
  data.forEach((r) => {
    let g = groups.find((x) => x.id === r.semester_id);
    if (!g) groups.push((g = { id: r.semester_id, ar: r.semester_ar, en: r.semester_en, rows: [] }));
    g.rows.push(r);
  });

  if (isNativeApp()) {
    return (
      <div className="native-stack">
        {offline && <Alert type="info">{t('offline.banner')}</Alert>}
        <button type="button" className="b b-ghost" onClick={() => downloadFile('/student/export.xlsx', 'unidex-record.xlsx')}>{t('export.record')}</button>
        <GradesNative groups={groups} />
        <Evaluations />
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <div className="card">
        {offline && <Alert type="info">{t('offline.banner')}</Alert>}
        <EmptyState title={t('grades.none')} />
        <Evaluations />
      </div>
    );
  }

  return (
    <>
      <div className="row between no-print">
        {offline && <Alert type="info">{t('offline.banner')}</Alert>}
        <button type="button" className="b b-ghost" onClick={() => downloadFile('/student/export.xlsx', 'unidex-record.xlsx')}>{t('export.record')}</button>
      </div>
      {groups.map((g) => (
    <div className="card gap-bottom" key={g.id}>
      <h3 className="m0">{pick(g.ar, g.en)}</h3>
      <DataTable
        rowKey={(r) => r.enrollment_id}
        rowClass={(r) => (r.replaced ? 'replaced' : undefined)}
        columns={[
          { key: 'course', label: t('col.course'), render: (r) => <>{r.code} {pick(r.name_ar, r.name_en)} {r.replaced && <Tag kind="muted">{t('grade.replaced')}</Tag>}</> },
          { key: 'cw', label: t('grade.coursework'), render: (r) => `${r.coursework}/${r.max.coursework}` },
          { key: 'mid', label: t('grade.midterm'), render: (r) => `${r.midterm}/${r.max.midterm}` },
          { key: 'prac', label: t('grade.practical'), render: (r) => (r.has_practical ? `${r.practical}/${r.max.practical}` : '—') },
          { key: 'final', label: t('grade.final'), render: (r) => `${r.final_exam}/${r.max.final_exam}` },
          { key: 'total', label: t('grade.total'), render: (r) => <strong>{r.total}</strong> },
          { key: 'letter', label: t('grade.letter'), render: (r) => <span className={`tag ${r.points > 0 ? 'tag-ok' : 'tag-err'}`}>{r.letter}</span> },
        ]}
        rows={g.rows}
      />
    </div>
      ))}
      <Evaluations />
    </>
  );
}

function Evaluations() {
  const { t, pick } = useLanguage();
  const { toast } = useFeedback();
  const rows = useFetch('/student/evaluations');
  const [rating, setRating] = useState({});
  const [comment, setComment] = useState({});
  if (!rows.data || rows.data.length === 0) return null;
  async function send(offeringId) {
    try {
      await api.post('/student/evaluations', {
        offering_id: offeringId,
        rating: Number(rating[offeringId] || 5),
        comment: comment[offeringId] || '',
      });
      toast({ type: 'success', message: t('eval.sent') });
      rows.reload();
    } catch (error) {
      toast({ type: 'error', message: errorText(error, t) });
    }
  }
  return (
    <div className="card gap-top">
      <h3 className="m0">{t('eval.title')}</h3>
      <p className="muted small">{t('eval.hint')}</p>
      {rows.data.map((row) => (
        <form key={row.offering_id} className="att-card" onSubmit={(e) => { e.preventDefault(); send(row.offering_id); }}>
          <strong>{row.code}</strong> {pick(row.name_ar, row.name_en)}
          <div className="row">
            <select value={rating[row.offering_id] || row.rating || 5} onChange={(e) => setRating({ ...rating, [row.offering_id]: e.target.value })}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <input value={comment[row.offering_id] ?? row.comment ?? ''} onChange={(e) => setComment({ ...comment, [row.offering_id]: e.target.value })} placeholder={t('eval.comments')} />
            <button className="b b-primary" type="submit">{t('eval.submit')}</button>
          </div>
        </form>
      ))}
    </div>
  );
}
