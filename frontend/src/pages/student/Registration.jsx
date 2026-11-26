import { useState } from 'react';
import api from '../../api/axios';
import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import { Alert, FetchBody, LoadError, Tag } from '../../components/ui';
import { isNativeApp } from '../../native/platform';
import { RegistrationNative } from '../../native/views';
import { errorText, hhmm } from '../../utils/format';

export default function Registration() {
  const { t, pick } = useLanguage();
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (dept) params.set('department_id', dept);

  const offers = useFetch(`/offerings?${params}`);
  const mine = useFetch('/enrollments/me');
  const depts = useFetch('/departments');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const open = !!mine.data?.semester?.registration_open;

  async function act(fn, okKey) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ type: 'success', text: t(okKey) });
      offers.reload();
      mine.reload();
    } catch (e) {
      setMsg({ type: 'error', text: errorText(e, t) });
    } finally {
      setBusy(false);
    }
  }

  const meetingsText = (o) => o.meetings.map((m) => `${t('day.' + m.day_of_week)} ${hhmm(m.start_time)}–${hhmm(m.end_time)} (${m.room})`).join(' | ');

  function action(o) {
    if (o.enrollment_status === 'completed') return <Tag kind="info">{t('reg.completed')}</Tag>;
    if (o.enrollment_status === 'failed') return <Tag kind="err">{t('reg.failed')}</Tag>;
    if (o.enrolled) return <Tag kind="ok">{t('reg.registered')}</Tag>;
    if (o.passed) return <Tag kind="muted">{t('reg.passed')}</Tag>;
    if (o.prereq_missing?.length) return <Tag kind="warn">{t('reg.needs')}: {o.prereq_missing.join(', ')}</Tag>;
    if (o.enrolled_count >= o.capacity) return <Tag kind="err">{t('reg.full')}</Tag>;
    return (
      <button className="b b-primary" disabled={busy || !open} onClick={() => act(() => api.post('/enrollments', { offering_id: o.id }), 'reg.done')}>
        {t('reg.register')}
      </button>
    );
  }

  if (isNativeApp()) {
    return (
      <RegistrationNative
        q={q}
        setQ={setQ}
        dept={dept}
        setDept={setDept}
        depts={depts}
        offers={offers}
        mine={mine}
        msg={msg}
        open={open}
        busy={busy}
        onDrop={(course) => act(() => api.delete(`/enrollments/${course.enrollment_id}`), 'reg.dropped')}
        renderAction={action}
      />
    );
  }

  return (
    <>
      <div className="card">
        <div className="row between">
          <h2 className="m0">{t('nav.registration')}</h2>
          {mine.data?.semester && (
            <span>
              {pick(mine.data.semester.name_ar, mine.data.semester.name_en)}{' '}
              <Tag kind={open ? 'ok' : 'err'}>{open ? t('reg.open') : t('reg.closed')}</Tag>
            </span>
          )}
        </div>
        <Alert type={msg?.type}>{msg?.text}</Alert>
      </div>

      <div className="card gap-top">
        <h3 className="m0">{t('reg.myCourses')}</h3>
        <FetchBody loading={mine.loading} error={mine.error} data={mine.data} onRetry={mine.reload}>
          {(enr) => (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('col.code')}</th><th>{t('col.course')}</th><th>{t('col.credits')}</th><th>{t('col.schedule')}</th><th /></tr></thead>
                <tbody>
                  {enr.courses.length === 0 && <tr><td colSpan={5} className="muted">{t('reg.none')}</td></tr>}
                  {enr.courses.map((c) => (
                    <tr key={c.enrollment_id}>
                      <td><strong>{c.code}</strong></td>
                      <td>{pick(c.name_ar, c.name_en)}</td>
                      <td>{c.credit_hours}</td>
                      <td className="small">{meetingsText(c)}</td>
                      <td>
                        {c.status === 'enrolled'
                          ? <button className="btn-small" disabled={busy || !open} onClick={() => act(() => api.delete(`/enrollments/${c.enrollment_id}`), 'reg.dropped')}>{t('reg.drop')}</button>
                          : <Tag kind={c.status === 'failed' ? 'err' : 'info'}>{t(c.status === 'failed' ? 'reg.failed' : 'reg.completed')}</Tag>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p><strong>{t('reg.total')}: {enr.total_credits} / {enr.max_credits}</strong></p>
          </>
          )}
        </FetchBody>
      </div>

      <div className="card gap-top">
        <h3 className="m0">{t('reg.available')}</h3>
        <div className="toolbar inline">
          <input placeholder={t('catalog.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">{t('catalog.allDepts')}</option>
            {(depts.data || []).map((d) => <option key={d.id} value={d.id}>{pick(d.name_ar, d.name_en)}</option>)}
          </select>
        </div>
        {depts.error && <LoadError error={depts.error} onRetry={depts.reload} />}
        <FetchBody loading={offers.loading} error={offers.error} data={offers.data} onRetry={offers.reload}>
          {(list) => (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>{t('col.code')}</th><th>{t('col.course')}</th><th>{t('col.credits')}</th><th>{t('col.instructor')}</th><th>{t('col.schedule')}</th><th>{t('col.seats')}</th><th /></tr>
              </thead>
              <tbody>
                {list.length === 0 && <tr><td colSpan={7} className="muted">{t('reg.none')}</td></tr>}
                {list.map((o) => (
                  <tr key={o.id}>
                    <td><strong>{o.code}</strong></td>
                    <td>{pick(o.name_ar, o.name_en)}</td>
                    <td>{o.credit_hours}</td>
                    <td>{pick(o.instructor_ar, o.instructor_en)}</td>
                    <td className="small">{meetingsText(o)}</td>
                    <td>{o.enrolled_count}/{o.capacity}</td>
                    <td>{action(o)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </FetchBody>
      </div>
    </>
  );
}
