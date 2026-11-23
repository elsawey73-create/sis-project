import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../api/axios';
import { useLanguage } from '../../context/LanguageContext';
import { Alert, Loading } from '../../components/ui';
import { errorText } from '../../utils/format';

// Page opened by the QR code: /attend?s=<session>&t=<token>
export default function Attend() {
  const { t, pick } = useLanguage();
  const [params] = useSearchParams();
  const [state, setState] = useState({ status: 'loading' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const s = params.get('s');
    const token = params.get('t');
    if (!s || !token) { setState({ status: 'none' }); return; }
    api.post('/attendance/scan', { session_id: Number(s), token })
      .then((r) => setState((prev) => (prev.status === 'ok' ? prev : { status: 'ok', data: r.data })))
      .catch((e) => {
        setState((prev) => {
          if (prev.status === 'ok') return prev;
          if (e.response?.data?.error === 'ALREADY_RECORDED') return { status: 'already' };
          if (prev.status === 'already') return prev;
          return { status: 'error', text: errorText(e, t) };
        });
      });
  }, [params, t]);

  return (
    <div className="card center-card">
      <h2 className="m0">{t('nav.attendance')}</h2>
      {state.status === 'loading' && <Loading />}
      {state.status === 'none' && <Alert type="info">{t('att.howto')}</Alert>}
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
