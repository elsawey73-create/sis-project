import { Camera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import jsQR from 'jsqr';
import { parseAttendanceTarget } from './attendanceLink';

function errorText(error) {
  return `${error?.message || ''} ${error?.code || ''}`.toLowerCase();
}

export function isCameraCancel(error) {
  const text = errorText(error);
  return text.includes('cancel') || text.includes('no picture') || text.includes('no_picture');
}

export function isCameraDenied(error) {
  const text = errorText(error);
  return text.includes('denied') || text.includes('permission');
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = src;
  });
}

async function decodeQr(src) {
  const img = await loadImage(src);
  if (typeof BarcodeDetector !== 'undefined') {
    try {
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      const codes = await detector.detect(img);
      if (codes[0]?.rawValue) return codes[0].rawValue;
    } catch {
      /* jsQR below covers WebViews without BarcodeDetector. */
    }
  }
  const canvas = document.createElement('canvas');
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
  return code?.data || '';
}

// Opens the Capacitor camera, then reads the attendance QR from the photo.
export async function scanAttendanceQr() {
  const status = await Camera.requestPermissions({ permissions: ['camera'] });
  if (status.camera !== 'granted' && status.camera !== 'limited') {
    const denied = new Error('User denied access to camera');
    denied.code = 'CAMERA_DENIED';
    throw denied;
  }
  const photo = await Camera.takePhoto({
    quality: 90,
    saveToGallery: false,
    correctOrientation: true,
    editable: 'no',
    targetWidth: 1600,
    targetHeight: 1600,
  });
  const src = photo.webPath || (photo.uri ? Capacitor.convertFileSrc(photo.uri) : '');
  const dataUrl = photo.thumbnail
    ? (photo.thumbnail.startsWith('data:') ? photo.thumbnail : `data:image/jpeg;base64,${photo.thumbnail}`)
    : '';
  const text = await decodeQr(src || dataUrl);
  const target = parseAttendanceTarget(text);
  if (!target) {
    const unread = new Error('QR_UNREADABLE');
    unread.code = 'QR_UNREADABLE';
    throw unread;
  }
  return target;
}
