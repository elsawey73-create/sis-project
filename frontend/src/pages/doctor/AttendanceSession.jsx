import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import api from '../../api/axios';
import { useLanguage } from '../../context/LanguageContext';
import { Alert, LoadError, Loading, Stat } from '../../components/ui';
import { errorText } from '../../utils/format';

function formatRemaining(totalSeconds) {
  const s = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function AttendanceSession() {
  const { id } = useParams();
  const { t, pick } = useLanguage();
  const [info, setInfo] = useState(null);
  const [qr, setQr] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [loadError, setLoadError] = useState(null);
  const [tokenError, setTokenError] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadInfo = useCallback(
    () => api.get(`/attendance/sessions/${id}`)
      .then((r) => { setInfo(r.data); setLoadError(null); })
      .catch((e) => setLoadError(e)),
    [id]
  );

  const applyQr = useCallback((data) => {
    const expiresIn = Math.max(0, Number(data.expires_in) || 0);
    const expired = !!data.expired || expiresIn <= 0 || !data.qr_token;
    const issuedAt = Date.now();
    setNow(issuedAt);
    setQr({
      token: expired ? null : data.qr_token,
      expired,
      expiresIn,
      deadline: issuedAt + expiresIn * 1000,
    });
    setTokenError(null);
  }, []);

  const loadQr = useCallback(() => {
    api.get(`/attendance/sessions/${id}/qr`)
      .then((r) => applyQr(r.data))
      .catch((e) => {
        if (e.response?.status !== 404) {
          setTokenError(e);
          return;
        }
        api.post(`/attendance/sessions/${id}/qr`)
          .then((r) => applyQr(r.data))
          .catch((createError) => setTokenError(createError));
      });
  }, [id, applyQr]);

  // Refresh the roster every 4 seconds.
  useEffect(() => {
    loadInfo();
    const i = setInterval(loadInfo, 4000);
    return () => clearInterval(i);
  }, [loadInfo]);

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  const open = info?.session.status === 'open';

  useEffect(() => {
    if (!open) return undefined;
    loadQr();
    return undefined;
  }, [open, loadQr]);

  async function refreshQr() {
    setRefreshing(true);
    try {
      const r = await api.post(`/attendance/sessions/${id}/qr/refresh`);
      applyQr(r.data);
    } catch (e) {
      setTokenError(e);
    } finally {
      setRefreshing(false);
    }
  }

  async function close() {
    try {
      await api.post(`/attendance/sessions/${id}/close`);
      setQr(null);
      setTokenError(null);
      loadInfo();
    } catch (e) {
      setError(errorText(e, t));
    }
  }
  async function mark(studentId, status) {
    try { await api.put(`/attendance/sessions/${id}/students/${studentId}`, { status }); loadInfo(); }
    catch (e) { setError(errorText(e, t)); }
  }

  if (!info) return loadError ? <LoadError error={loadError} onRetry={loadInfo} /> : <Loading />;
  const { session, students, present, total } = info;
  const remaining = qr && qr.token && !qr.expired
    ? Math.min(qr.expiresIn, Math.max(0, Math.floor((qr.deadline - now) / 1000)))
    : 0;
  const timedOut = !!(qr && !qr.expired && (now >= qr.deadline || remaining <= 0));
  const showCode = !!(qr && qr.token && !qr.expired && !timedOut);
  const url = showCode ? `${window.location.origin}/attend?s=${id}&t=${qr.token}` : '';
  const phoneCannotOpen = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

  return (
    <>
      <div className="card">
        <div className="row between">
          <h2 className="m0">{t('nav.attendance')} — {session.code} {pick(session.name_ar, session.name_en)}</h2>
          <Link to={`/doctor/offerings/${session.offering_id}`}>← {t('doc.gradesStudents')}</Link>
        </div>
        {loadError && <LoadError error={loadError} onRetry={loadInfo} />}
        <Alert>{error}</Alert>
      </div>

      <div className="grid-qr gap-top">
        <div className="card center-text">
          {open ? (
            <>
              {phoneCannotOpen && <Alert type="warn">{t('att.phoneHost')}</Alert>}
              {showCode ? (
                <div className="qr-box">
                  <QRCodeSVG value={url} size={280} includeMargin bgColor="#FFFFFF" fgColor="#0F172A" />
                </div>
              ) : (qr?.expired || timedOut) ? (
                <div className="qr-box qr-expired"><p className="m0">{t('att.qrExpired')}</p></div>
              ) : tokenError ? null : (
                <div className="qr-box"><Loading /></div>
              )}
              {showCode && (
                <>
                  <p className="muted small qr-timer-label">{t('att.qrRemaining')}</p>
                  <p className="qr-timer">{formatRemaining(remaining)}</p>
                </>
              )}
              {tokenError && <LoadError error={tokenError} onRetry={showCode ? refreshQr : loadQr} />}
              <p className="muted small">{t('att.qrHint')}</p>
              <div className="row qr-actions">
                <button className="b b-ghost" disabled={refreshing} onClick={refreshQr}>{t('att.refreshQr')}</button>
                <button className="b b-danger" onClick={close}>{t('att.close')}</button>
              </div>
            </>
          ) : (
            <p className="muted">🔒 {t('att.closed')}</p>
          )}
        </div>
        <div className="card">
          <Stat label={t('att.attended')} value={`${present} / ${total}`} />
          <div className="table-wrap gap-top">
            <table className="table">
              <tbody>
                {students.map((s) => (
                  <tr key={s.student_id}>
                    <td><bdi>{s.student_code}</bdi></td>
                    <td>{pick(s.full_name_ar, s.full_name_en)}</td>
                    <td>
                      <select className={`status-select status-${s.status || 'absent'}`} value={s.status || 'absent'} onChange={(e) => mark(s.student_id, e.target.value)}>
                        {['present', 'late', 'excused', 'absent'].map((v) => <option key={v} value={v}>{t('att.s.' + v)}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
