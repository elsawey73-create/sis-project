import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';

export default function ThemeSwitcher() {
  const { t } = useLanguage();
  const { preference, cycle } = useTheme();

  return (
    <button type="button" className="btn-lang" onClick={cycle} title={t('theme.switch')} aria-label={t('theme.switch')}>
      {t('theme.' + preference)}
    </button>
  );
}
