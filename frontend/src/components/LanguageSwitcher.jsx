import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function LanguageSwitcher() {
  const { lang, setLang, t } = useLanguage();
  const { user } = useAuth();

  function toggle() {
    const next = lang === 'ar' ? 'en' : 'ar';
    setLang(next);
    // When signed in, store the language on the account.
    if (user) api.patch('/auth/language', { lang: next }).catch(() => {});
  }

  return (
    <button type="button" className="btn-lang" onClick={toggle}>
      {t('lang.switch')}
    </button>
  );
}
