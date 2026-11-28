import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { Alert, Loading } from '../../components/ui';
import FaceCapture from '../../components/FaceCapture';
import { isNativeApp, openScanner } from '../../native/platform';
import { submitAttendance } from '../../utils/attendanceScan';
import { errorText } from '../../utils/format';

// Page opened by the QR code: /attend?s=<session>&t=<token>
export default function Attend() {
  const { t, pick } = useLanguage();
  const [params] = useSearchParams();
  const sessionId = params.get('s');
  const token = params.get('t');
  const [state, setState] = useState({ status: sessionId && token ? 'capture' : 'none' });

  async function onCapture(photo) {
    setState({ status: 'loading' });
    try {
      const response = await submitAttendance({ sessionId, token, photo });
      setState({ status: 'ok', data: response.data });
    } catch (error) {
      if (error.response?.data?.error === 'ALREADY_RECORDED') setState({ status: 'already' });
      else setState({ status: 'error', text: errorText(error, t) });
    }
  }

  return (
    <div className="card center-card">
      <h2 className="m0">{t('nav.attendance')}</h2>
      {state.status === 'none' && <Alert type="info">{isNativeApp() ? t('att.howtoApp') : t('att.howto')}</Alert>}
      {state.status === 'capture' && (
        <>
          <p className="muted">{t('att.faceHint')}</p>
          <FaceCapture onCapture={onCapture} />
        </>
      )}
      {state.status === 'loading' && <Loading />}
      {isNativeApp() && state.status !== 'loading' && state.status !== 'capture' && (
        <button type="button" className="b b-primary" onClick={openScanner}>{t('nav.scan')}</button>
      )}
      {state.status === 'error' && <Alert type="error">{state.text}</Alert>}
      {state.status === 'already' && <Alert type="success">{t('att.already')}</Alert>}
      {state.status === 'ok' && (
        <Alert type={state.data.status === 'late' ? 'warn' : 'success'}>
          ✅ {state.data.status === 'late' ? t('att.late') : t('att.recorded')} — <strong>{state.data.course.code}</strong> {pick(state.data.course.name_ar, state.data.course.name_en)}
        </Alert>
      )}
      <p><Link to="/student/attendance">{t('att.mine')}</Link></p>
    </div>
  );
}
