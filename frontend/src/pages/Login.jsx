import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, homeByRole } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import Brand from '../components/Brand';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function Login() {
  const { user, login } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const from = useLocation().state?.from;
  const dest = from ? from.pathname + (from.search || '') : null;
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // لو مسجّل دخول بالفعل
  if (user) return <Navigate to={dest || homeByRole[user.role]} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorCode('');
    setSubmitting(true);
    try {
      const u = await login(loginId, password);
      navigate(dest || homeByRole[u.role], { replace: true });
    } catch (err) {
      // بنخزّن كود الخطأ مش النص، عشان لو غيّر اللغة النص يتغير
      setErrorCode(err.response?.data?.error || 'NETWORK');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="center">
      <form className="card login-card" onSubmit={handleSubmit}>
        <div className="login-top">
          <LanguageSwitcher />
        </div>

        <div className="login-head">
          <Brand large />
          <p className="muted">{t('app.tagline')}</p>
        </div>

        <h2 className="login-title">{t('login.title')}</h2>

        <label>{t('login.id')}</label>
        <input
          type="text"
          dir="ltr"
          autoComplete="username"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          placeholder={t('login.idPlaceholder')}
          required
        />

        <label>{t('login.password')}</label>
        <input
          type="password"
          dir="ltr"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {errorCode && <div className="error">{t('error.' + errorCode)}</div>}

        <button className="btn" disabled={submitting}>
          {submitting ? t('login.submitting') : t('login.submit')}
        </button>
      </form>
    </div>
  );
}
