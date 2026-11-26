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
    <div className="skeleton" role="status" aria-live="polite">
      <span className="sr-only">{t('common.loading')}</span>
      <span className="skeleton-line" />
      <span className="skeleton-line skeleton-line-mid" />
      <span className="skeleton-line skeleton-line-short" />
    </div>
  );
}

export function ScreenLoading() {
  const { t } = useLanguage();
  return (
    <div className="center">
      <div className="card splash-card" role="status" aria-live="polite">
        <span className="spinner spinner-lg" aria-hidden="true" />
        <p className="muted m0">{t('common.loading')}</p>
        <div className="skeleton" aria-hidden="true">
          <span className="skeleton-line" />
          <span className="skeleton-line skeleton-line-short" />
        </div>
      </div>
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
