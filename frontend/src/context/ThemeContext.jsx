import { createContext, useCallback, useContext, useLayoutEffect, useState } from 'react';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'theme';
const ORDER = ['light', 'dark', 'system'];

// Saved choice, or system when the browser has no stored preference.
function readStoredTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return ORDER.includes(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

function systemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(preference) {
  return preference === 'system' ? systemTheme() : preference;
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(readStoredTheme);

  // Paint the resolved theme on <html> before the browser shows the next frame.
  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', resolveTheme(preference));
    if (preference !== 'system') return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.setAttribute('data-theme', systemTheme());
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);

  const setTheme = useCallback((next) => {
    const value = ORDER.includes(next) ? next : 'system';
    setPreference(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
  }, []);

  const cycle = useCallback(() => {
    const index = ORDER.indexOf(preference);
    setTheme(ORDER[(index + 1) % ORDER.length]);
  }, [preference, setTheme]);

  return (
    <ThemeContext.Provider value={{ preference, setTheme, cycle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
