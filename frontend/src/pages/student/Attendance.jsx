import { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import { Alert, LoadError, Loading, Meter, Tag } from '../../components/ui';
import { isNativeApp } from '../../native/platform';
import { AttendanceNative } from '../../native/views';

function statusOf(row) {
  if (row.status) return row.status;
  return row.session_status === 'closed' ? 'absent' : 'pending';
}

export default function Attendance() {
  const { t, pick } = useLanguage();
  const terms = useFetch('/student/terms');
  const [semesterId, setSemesterId] = useState('');
  const query = semesterId ? `/attendance/me?semester_id=${semesterId}` : '/attendance/me';
  const historyQuery = semesterId ? `/attendance/me/history?semester_id=${semesterId}` : '/attendance/me/history';
  const { data, error, loading, reload } = useFetch(query);
  const history = useFetch(historyQuery);
  if (loading) return <Loading />;
  if (error || data == null) return <LoadError error={error} onRetry={reload} />;

  const termSelect = (
    <label className="field">
      <span>{t('col.semester')}</span>
      <select value={semesterId} onChange={(e) => setSemesterId(e.target.value)}>
        <option value="">{t('term.current')}</option>
        {(terms.data || []).map((term) => (
          <option key={term.id} value={term.id}>{pick(term.name_ar, term.name_en)}</option>
        ))}
      </select>
    </label>
  );

  if (isNativeApp()) {
    return (
      <>
        {termSelect}
        <AttendanceNative rows={data} />
        <HistoryList rows={history.data || []} />
      </>
    );
  }

  return (
    <>
      <div className="card">
        <div className="row between">
          <h2 className="m0">{t('nav.attendance')}</h2>
          {termSelect}
        </div>
        <Alert type="info">{t('att.howto')}</Alert>
        {data.length === 0 && <p className="muted">{t('reg.none')}</p>}
        <div className="stack gap-top">
          {data.map((row) => {
            const pct = row.total_sessions ? Math.round((row.attended / row.total_sessions) * 100) : 0;
            return (
              <article key={row.offering_id} className="att-card">
                <div className="row between">
                  <div>
                    <strong>{row.code}</strong> {pick(row.name_ar, row.name_en)}
                    <div className="muted small">{pick(row.semester_ar, row.semester_en)}</div>
                  </div>
                  {row.warning ? <Tag kind="err">{t('att.exceeded')}</Tag> : row.approaching ? <Tag kind="warn">{t('att.approaching')}</Tag> : <Tag kind="ok">OK</Tag>}
                </div>
                <Meter value={pct} label={`${t('att.attended')} ${row.attended}/${row.total_sessions}`} />
                <div className="muted small">{t('att.absent')}: {row.absent} ({row.absent_pct}%) · {t('att.limit')}: {row.absence_limit_pct}%</div>
              </article>
            );
          })}
        </div>
      </div>
      <div className="card gap-top">
        <h3 className="m0">{t('att.fullHistory')}</h3>
        <HistoryList rows={history.data || []} loading={history.loading} />
      </div>
    </>
  );
}

function HistoryList({ rows, loading }) {
  const { t, pick } = useLanguage();
  if (loading) return <Loading />;
  if (!rows.length) return <p className="muted">{t('att.noHistory')}</p>;
  return (
    <div className="table-wrap gap-top">
      <table className="table table-cards">
        <thead>
          <tr><th>{t('att.date')}</th><th>{t('col.course')}</th><th>{t('att.attended')}</th><th>{t('att.distance')}</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status = statusOf(row);
            return (
              <tr key={row.session_id}>
                <td data-label={t('att.date')}>{String(row.session_date).slice(0, 10)}</td>
                <td data-label={t('col.course')}><strong>{row.code}</strong> {pick(row.name_ar, row.name_en)}</td>
                <td data-label={t('att.attended')}><Tag kind={status === 'absent' ? 'err' : status === 'pending' ? 'muted' : 'ok'}>{t('att.s.' + status)}</Tag></td>
                <td data-label={t('att.distance')}>{row.distance_m == null ? '—' : `${row.distance_m} m`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
