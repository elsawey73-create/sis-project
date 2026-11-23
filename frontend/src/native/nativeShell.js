import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';

// Status bar icons stay light on the navy bar. The splash hides once the
// WebView has a frame, so the launch screen does not sit like a browser chrome.
export function prepareNativeShell() {
  if (!Capacitor.isNativePlatform()) return;
  SystemBars.setStyle({ style: SystemBarsStyle.Dark }).catch(() => {});
  const hide = () => SplashScreen.hide().catch(() => {});
  if (document.readyState === 'complete') requestAnimationFrame(hide);
  else window.addEventListener('load', () => requestAnimationFrame(hide), { once: true });
}
