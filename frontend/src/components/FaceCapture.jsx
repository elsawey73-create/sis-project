import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { isNativeApp } from '../native/platform';

const MAX_EDGE = 960;

function snapJpeg(video) {
  const width = video.videoWidth || 640;
  const height = video.videoHeight || 480;
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL('image/jpeg', 0.72);
  return url.split(',')[1] || '';
}

// Front camera. Android opens the Capacitor camera. The website uses getUserMedia.
export default function FaceCapture({ onCapture }) {
  const { t } = useLanguage();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const native = isNativeApp();

  useEffect(() => {
    if (native) return undefined;
    let stopped = false;
    navigator.mediaDevices?.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    }).then((stream) => {
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    }).catch(() => setError(t('att.cameraDenied')));
    return () => {
      stopped = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [native, t]);

  async function capture() {
    setBusy(true);
    setError('');
    try {
      if (native) {
        const { Camera, CameraResultType, CameraSource, CameraDirection } = await import('@capacitor/camera');
        const photo = await Camera.getPhoto({
          quality: 70,
          width: MAX_EDGE,
          resultType: CameraResultType.Base64,
          source: CameraSource.Camera,
          direction: CameraDirection.Front,
          correctOrientation: true,
          saveToGallery: false,
        });
        if (!photo.base64String) throw new Error('empty');
        onCapture(photo.base64String);
        return;
      }
      const video = videoRef.current;
      if (!video || !video.videoWidth) throw new Error('empty');
      const jpeg = snapJpeg(video);
      if (!jpeg) throw new Error('empty');
      streamRef.current?.getTracks().forEach((track) => track.stop());
      onCapture(jpeg);
    } catch {
      setError(t('att.cameraDenied'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="face-capture">
      {native ? (
        <p className="muted">{t('att.faceNative')}</p>
      ) : (
        <video ref={videoRef} className="face-video" autoPlay muted playsInline />
      )}
      {error && <p className="alert alert-error">{error}</p>}
      <button type="button" className="b b-primary" disabled={busy} onClick={capture}>
        {t('att.capture')}
      </button>
    </div>
  );
}
