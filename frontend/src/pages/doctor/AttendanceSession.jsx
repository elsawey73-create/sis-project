import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import api from '../../api/axios';
import { useLanguage } from '../../context/LanguageContext';
import { Alert, LoadError, Loading, Stat } from '../../components/ui';
import { useFeedback } from '../../context/FeedbackContext';
import { errorText } from '../../utils/format';

export default function AttendanceSession() {
  const { id } = useParams();
  const { t, pick } = useLanguage();
  const [info, setInfo] = useState(null);
  const [token, setToken] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [tokenError, setTokenError] = useState(null);
  const [error, setError] = useState('');
  const { toast } = useFeedback();

  const loadInfo = useCallback(
    () => api.get(`/attendance/sessions/${id}`)
      .then((r) => { setInfo(r.data); setLoadError(null); })
      .catch((e) => setLoadError(e)),
    [id]
  );

  const refreshToken = useCallback(
    () => api.get(`/attendance/sessions/${id}/token`)
      .then((r) => { setToken(r.data.token); setTokenError(null); })
      .catch((e) => setTokenError(e)),
    [id]
  );

  // Refresh the roster every 4 seconds.
  useEffect(() => {
    loadInfo();
    const i = setInterval(loadInfo, 4000);
    return () => clearInterval(i);
  }, [loadInfo]);

  const open = info?.session.status === 'open';

  // Replace the QR every 20 seconds so a photo of it expires quickly.
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    const get = () => api.get(`/attendance/sessions/${id}/token`)
      .then((r) => { if (!alive) return; setToken(r.data.token); setTokenError(null); })
      .catch((e) => { if (alive) setTokenError(e); });
    get();
    const i = setInterval(get, 20000);
    return () => { alive = false; clearInterval(i); };
  }, [open, id]);

  async function close() {
    try {
      await api.post(`/attendance/sessions/${id}/close`);
      setToken(null);
      setTokenError(null);
      loadInfo();
    } catch (e) {
      const text = errorText(e, t);
      setError(text);
      toast({ type: 'error', message: text });
    }
  }
  async function mark(studentId, status) {
    try { await api.put(`/attendance/sessions/${id}/students/${studentId}`, { status }); loadInfo(); }
    catch (e) {
      const text = errorText(e, t);
      setError(text);
      toast({ type: 'error', message: text });
    }
  }

  if (!info) return loadError ? <LoadError error={loadError} onRetry={loadInfo} /> : <Loading />;
  const { session, students, present, total } = info;
  const url = token ? `${window.location.origin}/attend?s=${id}&t=${token}` : '';
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
              <div className="qr-box">{url ? <QRCodeSVG value={url} size={280} includeMargin bgColor="#FFFFFF" fgColor="#0F172A" /> : tokenError ? null : <Loading />}</div>
              {tokenError && <LoadError error={tokenError} onRetry={refreshToken} />}
              <p className="muted small">{t('att.qrHint')}</p>
              <button className="b b-danger" onClick={close}>{t('att.close')}</button>
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
