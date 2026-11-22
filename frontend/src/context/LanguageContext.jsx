import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { translations } from '../i18n/translations';

const LanguageContext = createContext(null);

// اللغة اللي المستخدم اختارها قبل كده على الجهاز ده (لو فيه)
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

  // يغيّر اتجاه الصفحة (RTL / LTR) تلقائياً
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

  // t('login.title') => النص باللغة الحالية
  const t = useCallback(
    (key) => translations[lang][key] ?? translations.ar[key] ?? key,
    [lang]
  );

  // pick(عربي, إنجليزي) => للبيانات اللي جاية من الداتابيز (أسماء، أقسام، مواد)
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
