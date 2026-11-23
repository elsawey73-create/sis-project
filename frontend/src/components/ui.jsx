import { useLanguage } from '../context/LanguageContext';
import { errorText } from '../utils/format';

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
  return (
    <div className="muted pad loading-line" role="status">
      <span className="spinner" aria-hidden="true" />
      {t('common.loading')}
    </div>
  );
}

export function LoadError({ error, onRetry }) {
  const { t } = useLanguage();
  return (
    <Alert>
      <div className="row between">
        <span>{errorText(error, t)}</span>
        {onRetry && <button type="button" className="b b-ghost" onClick={onRetry}>{t('common.retry')}</button>}
      </div>
    </Alert>
  );
}

export function FetchBody({ loading, error, data, onRetry, children }) {
  if (loading) return <Loading />;
  if (error || data == null) return <LoadError error={error} onRetry={onRetry} />;
  return typeof children === 'function' ? children(data) : children;
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
