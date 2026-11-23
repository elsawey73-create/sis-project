import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import Brand from '../components/Brand';
import LanguageSwitcher from '../components/LanguageSwitcher';
import ThemeSwitcher from '../components/ThemeSwitcher';
import { useLanguage } from '../context/LanguageContext';

export default function ForgotPassword() {
  const { t } = useLanguage();
  const [identifier, setIdentifier] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorCode('');
    setAccepted(false);
    setSubmitting(true);
    try {
      await api.post('/auth/forgot-password', { identifier });
      setAccepted(true);
    } catch (err) {
      setErrorCode(err.response?.data?.error || 'NETWORK');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="center">
      <form className="card login-card reset-card" onSubmit={handleSubmit}>
        <div className="login-top">
          <ThemeSwitcher />
          <LanguageSwitcher />
        </div>

        <div className="login-head">
          <Brand large />
          <p className="muted">{t('app.tagline')}</p>
        </div>

        <h2 className="login-title">{t('reset.requestTitle')}</h2>
        <p className="muted">{t('reset.requestHint')}</p>

        <label htmlFor="reset-identifier">{t('reset.identifier')}</label>
        <input
          id="reset-identifier"
          type="text"
          dir="ltr"
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder={t('reset.identifierPlaceholder')}
          required
        />

        {errorCode && <div className="error">{t('error.' + errorCode)}</div>}

        {accepted && (
          <div className="alert alert-success" role="status">
            <p className="m0"><strong>{t('reset.checkEmail')}</strong></p>
            <p className="m0">{t('reset.checkEmailHint')}</p>
          </div>
        )}

        <button className="btn" disabled={submitting}>
          {submitting ? t('reset.submitting') : t('reset.submit')}
        </button>

        <p className="center-text">
          <Link to="/login">{t('reset.backToLogin')}</Link>
        </p>
      </form>
    </div>
  );
}
