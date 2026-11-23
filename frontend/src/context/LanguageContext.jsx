import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { translations } from '../i18n/translations';

const LanguageContext = createContext(null);

// Language previously chosen on this device, if any.
export function readStoredLang() {
  try {
    const l = localStorage.getItem('lang');
    return l === 'ar' || l === 'en' ? l : null;
  } catch {
    return null;
  }
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readStoredLang() || 'ar');

  // Keep document direction in sync with the language (RTL or LTR).
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const setLang = useCallback((l) => {
    setLangState(l);
    try {
      localStorage.setItem('lang', l);
    } catch {
      /* ignore */
    }
  }, []);

  // t('login.title') returns the string for the active language.
  const t = useCallback(
    (key) => translations[lang][key] ?? translations.ar[key] ?? key,
    [lang]
  );

  // pick(arabic, english) chooses a database field (names, departments, courses).
  const pick = useCallback((ar, en) => (lang === 'en' && en ? en : ar), [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, pick }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
