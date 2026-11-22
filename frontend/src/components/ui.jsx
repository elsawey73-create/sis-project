import { useLanguage } from '../context/LanguageContext';

export function Alert({ type = 'error', children }) {
  if (!children) return null;
  return <div className={`alert alert-${type}`}>{children}</div>;
}

export function Stat({ label, value, hint }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="muted small">{hint}</div>}
    </div>
  );
}

export function Loading() {
  const { t } = useLanguage();
  return <div className="muted pad">{t('common.loading')}</div>;
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Tag({ kind = 'muted', children }) {
  return <span className={`tag tag-${kind}`}>{children}</span>;
}
