import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import api from '../../api/axios';
import { useLanguage } from '../../context/LanguageContext';
import { Alert, Loading, Stat } from '../../components/ui';
import { errorText } from '../../utils/format';

export default function AttendanceSession() {
  const { id } = useParams();
  const { t, pick } = useLanguage();
  const [info, setInfo] = useState(null);
  const [token, setToken] = useState(null);
  const [error, setError] = useState('');

  const loadInfo = useCallback(
    () => api.get(`/attendance/sessions/${id}`).then((r) => setInfo(r.data)).catch((e) => setError(errorText(e, t))),
    [id, t]
  );

  // تحديث لايف لقائمة الحاضرين كل 4 ثواني
  useEffect(() => {
    loadInfo();
    const i = setInterval(loadInfo, 4000);
    return () => clearInterval(i);
  }, [loadInfo]);

  const open = info?.session.status === 'open';

  // QR جديد كل 20 ثانية (عشان صورته ماتنفعش لحد غايب)
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    const get = () => api.get(`/attendance/sessions/${id}/token`).then((r) => alive && setToken(r.data.token)).catch(() => {});
    get();
    const i = setInterval(get, 20000);
    return () => { alive = false; clearInterval(i); };
  }, [open, id]);

  async function close() {
    await api.post(`/attendance/sessions/${id}/close`);
    setToken(null);
    loadInfo();
  }
  async function mark(studentId, status) {
    try { await api.put(`/attendance/sessions/${id}/students/${studentId}`, { status }); loadInfo(); }
    catch (e) { setError(errorText(e, t)); }
  }

  if (!info) return error ? <Alert>{error}</Alert> : <Loading />;
  const { session, students, present, total } = info;
  const url = token ? `${window.location.origin}/attend?s=${id}&t=${token}` : '';

  return (
    <>
      <div className="card">
        <div className="row between">
          <h2 className="m0">{t('nav.attendance')} — {session.code} {pick(session.name_ar, session.name_en)}</h2>
          <Link to={`/doctor/offerings/${session.offering_id}`}>← {t('doc.gradesStudents')}</Link>
        </div>
        <Alert>{error}</Alert>
      </div>

      <div className="grid-qr gap-top">
        <div className="card center-text">
          {open ? (
            <>
              <div className="qr-box">{url ? <QRCodeSVG value={url} size={280} includeMargin /> : <Loading />}</div>
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
                      <select className="status-select" value={s.status || 'absent'} onChange={(e) => mark(s.student_id, e.target.value)}>
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
