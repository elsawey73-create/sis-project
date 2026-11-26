import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useLanguage } from '../context/LanguageContext';
import { Alert, Loading } from '../components/ui';
import { errorText } from '../utils/format';
import { parseAttendanceQr } from './qr';
import Icon from './icons';

// In-app camera scanner. Posts to the same /attendance/scan route the website uses
// when a student opens /attend?s=&t= from a QR.
export default function QrScanner({ onClose }) {
  const [attempt, setAttempt] = useState(0);
  return <ScanAttempt key={attempt} onClose={onClose} onAgain={() => setAttempt((value) => value + 1)} />;
}

function ScanAttempt({ onClose, onAgain }) {
  const { t, pick } = useLanguage();
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const handled = useRef(false);
  const [phase, setPhase] = useState('opening');
  const [notice, setNotice] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    let stopped = false;

    async function submit(parsed) {
      setPhase('submitting');
      try {
        const response = await api.post('/attendance/scan', {
          session_id: parsed.sessionId,
          token: parsed.token,
        });
        if (stopped) return;
        setResult({ status: 'ok', data: response.data });
        setPhase('done');
      } catch (error) {
        if (stopped) return;
        if (error.response?.data?.error === 'ALREADY_RECORDED') {
          setResult({ status: 'already' });
        } else {
          setResult({ status: 'error', text: errorText(error, t) });
        }
        setPhase('done');
      }
    }

    async function start() {
      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        if (stopped) return;
        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } }, audio: false },
          videoRef.current,
          (found, _error, scanner) => {
            if (stopped || handled.current || !found) return;
            const parsed = parseAttendanceQr(found.getText());
            if (!parsed) {
              setNotice(t('native.scanInvalid'));
              return;
            }
            handled.current = true;
            scanner.stop();
            submit(parsed);
          },
        );
        if (stopped) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setPhase('scan');
      } catch (error) {
        if (stopped) return;
        const denied = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError';
        setCameraError(denied ? t('native.scanNeedCamera') : t('native.scanUnsupported'));
        setPhase('error');
      }
    }

    start();
    return () => {
      stopped = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [t]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="native-scanner" role="dialog" aria-modal="true" aria-label={t('native.scanTitle')}>
      <header className="native-scanner-bar">
        <button type="button" className="native-back" onClick={onClose} aria-label={t('native.close')}>
          <Icon name="close" />
        </button>
        <h2 className="m0">{t('native.scanTitle')}</h2>
      </header>

      <div className={`native-viewfinder${phase === 'done' || phase === 'error' ? ' is-hidden' : ''}`}>
        <video ref={videoRef} muted playsInline autoPlay />
        <div className="native-reticle" />
      </div>

      <div className="native-scanner-body">
        {phase === 'opening' && <Loading />}
        {phase === 'scan' && <p className="muted">{t('native.scanHint')}</p>}
        {phase === 'submitting' && <Loading />}
        {notice && phase === 'scan' && <Alert type="warn">{notice}</Alert>}
        {phase === 'error' && <Alert type="error">{cameraError}</Alert>}
        {phase === 'done' && result?.status === 'error' && <Alert type="error">{result.text}</Alert>}
        {phase === 'done' && result?.status === 'already' && <Alert type="success">{t('att.already')}</Alert>}
        {phase === 'done' && result?.status === 'ok' && (
          <Alert type={result.data.status === 'late' ? 'warn' : 'success'}>
            {result.data.status === 'late' ? t('att.late') : t('att.recorded')} — <strong>{result.data.course.code}</strong> {pick(result.data.course.name_ar, result.data.course.name_en)}
          </Alert>
        )}
        {phase === 'done' && (
          <p><Link to="/student/attendance" onClick={onClose}>{t('att.mine')}</Link></p>
        )}
        {(phase === 'done' || phase === 'error') && (
          <button type="button" className="b b-primary" onClick={onAgain}>
            {t('native.scanAgain')}
          </button>
        )}
      </div>
    </div>
  );
}
