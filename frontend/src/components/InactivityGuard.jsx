import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { idleExpired, idleRemaining } from '../utils/inactivity';

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'touchstart', 'click', 'scroll'];

// While a user is signed in, log out after 5 minutes without interaction.
// A backgrounded Android WebView may freeze timers, so resume checks the clock too.
export default function InactivityGuard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const lastActivity = useRef(0);
  const timer = useRef(0);
  const loggingOut = useRef(false);

  useEffect(() => {
    if (!user) return undefined;

    let alive = true;
    loggingOut.current = false;
    lastActivity.current = Date.now();

    const expire = () => {
      if (!alive || loggingOut.current) return;
      if (!idleExpired(lastActivity.current, Date.now())) {
        arm();
        return;
      }
      loggingOut.current = true;
      window.clearTimeout(timer.current);
      logout().finally(() => {
        if (alive) navigate('/login', { replace: true });
      });
    };

    const arm = () => {
      window.clearTimeout(timer.current);
      const remaining = idleRemaining(lastActivity.current, Date.now());
      if (remaining === 0) {
        expire();
        return;
      }
      timer.current = window.setTimeout(expire, remaining);
    };

    const mark = () => {
      const now = Date.now();
      if (now - lastActivity.current < 1000) return;
      lastActivity.current = now;
      arm();
    };

    // Coming back to a visible page. This does not count as activity.
    const onResume = () => {
      if (document.visibilityState === 'hidden') return;
      arm();
    };

    ACTIVITY_EVENTS.forEach((name) => {
      window.addEventListener(name, mark, { passive: true, capture: true });
    });
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);
    arm();

    return () => {
      alive = false;
      window.clearTimeout(timer.current);
      ACTIVITY_EVENTS.forEach((name) => {
        window.removeEventListener(name, mark, { capture: true });
      });
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('pageshow', onResume);
    };
  }, [user, logout, navigate]);

  return null;
}
