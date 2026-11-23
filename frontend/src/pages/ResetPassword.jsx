import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import Brand from '../components/Brand';
import LanguageSwitcher from '../components/LanguageSwitcher';
import ThemeSwitcher from '../components/ThemeSwitcher';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function ResetPassword() {
  const { t } = useLanguage();
  const { logout } = useAuth();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errorCode, setErrorCode] = useState(token ? '' : 'missing');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorCode('');
    if (!token) {
      setErrorCode('missing');
      return;
    }
    if (password !== confirm) {
      setErrorCode('PASSWORD_MISMATCH');
      return;
    }
    if (password.length < 6) {
      setErrorCode('WEAK_PASSWORD');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      if (localStorage.getItem('token')) await logout();
      setDone(true);
    } catch (err) {
      setErrorCode(err.response?.data?.error || 'NETWORK');
    } finally {
      setSubmitting(false);
    }
  }

  const errorText = errorCode === 'missing' ? t('reset.missingToken') : errorCode ? t('error.' + errorCode) : '';

  return (
    <div className="center">
      <form className="card login-card" onSubmit={handleSubmit}>
        <div className="login-top">
          <ThemeSwitcher />
          <LanguageSwitcher />
        </div>

        <div className="login-head">
          <Brand large />
          <p className="muted">{t('app.tagline')}</p>
        </div>

        <h2 className="login-title">{t('reset.setTitle')}</h2>

        {done ? (
          <div className="alert alert-success">
            <p className="m0">{t('reset.done')}</p>
            <Link className="btn reset-login-link" to="/login">{t('reset.signIn')}</Link>
          </div>
        ) : (
          <>
            <label htmlFor="new-password">{t('reset.newPassword')}</label>
            <input
              id="new-password"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <label htmlFor="confirm-password">{t('reset.confirmPassword')}</label>
            <input
              id="confirm-password"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />

            {errorText && <div className="error">{errorText}</div>}

            <button className="btn" disabled={submitting || !token}>
              {submitting ? t('reset.setting') : t('reset.setSubmit')}
            </button>
          </>
        )}

        {!done && (
          <p className="center-text">
            <Link to="/forgot-password">{t('reset.requestTitle')}</Link>
          </p>
        )}
      </form>
    </div>
  );
}
