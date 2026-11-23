import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useLanguage } from '../context/LanguageContext';
import { isCameraCancel, isCameraDenied, scanAttendanceQr } from '../native/scanAttendance';
import { Alert } from './ui';

// Shown only inside the Android/iOS shell. The website keeps the phone-camera instructions.
export default function ScanAttendanceButton({ onScanned }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!Capacitor.isNativePlatform()) return null;

  async function scan() {
    setBusy(true);
    setError('');
    try {
      const target = await scanAttendanceQr();
      if (onScanned) onScanned(target);
      else navigate(`/attend?s=${target.sessionId}&t=${encodeURIComponent(target.token)}`);
    } catch (err) {
      if (isCameraCancel(err)) return;
      setError(t(isCameraDenied(err) ? 'att.scanDenied' : 'att.scanFail'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scan-attendance">
      <p className="muted small">{t('att.scanHint')}</p>
      <button className="b b-primary" type="button" onClick={scan} disabled={busy}>
        {busy ? t('att.scanning') : t('att.scan')}
      </button>
      {error && <Alert type="error">{error}</Alert>}
    </div>
  );
}
