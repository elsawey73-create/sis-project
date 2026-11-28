import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { storeSession } from '../../api/axios';
import { Alert, Field } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import { useLanguage } from '../../context/LanguageContext';
import { isNativeApp } from '../../native/platform';

function AccountCard({ title, children }) {
  if (isNativeApp()) {
    return (
      <div className="native-stack">
        <article className="native-card">
          <h2 className="m0">{title}</h2>
          {children}
        </article>
      </div>
    );
  }
  return (
    <div className="card account-card">
      <h2 className="m0">{title}</h2>
      {children}
    </div>
  );
}

export default function ChangePassword() {
  const { t } = useLanguage();
  const { toast } = useFeedback();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorCode, setErrorCode] = useState('');
  const [done, setDone] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErrorCode('');
    setDone(false);
    if (!currentPassword || !password || !confirm) {
      setErrorCode('MISSING_FIELDS');
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
    setSaving(true);
    try {
      const res = await api.post('/auth/change-password', {
        current_password: currentPassword,
        password,
      });
      if (!res.data?.token || !res.data?.refresh_token) {
        await logout();
        navigate('/login', { replace: true });
        return;
      }
      storeSession(res.data.token, res.data.refresh_token);
      setCurrentPassword('');
      setPassword('');
      setConfirm('');
      setDone(true);
      toast({ type: 'success', message: t('password.updated') });
    } catch (err) {
      setErrorCode(err.response?.data?.error || 'NETWORK');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AccountCard title={t('password.change')}>
      <form onSubmit={onSubmit}>
        <Field label={t('password.current')}>
          <input
            dir="ltr"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </Field>
        <Field label={t('reset.newPassword')}>
          <input
            dir="ltr"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label={t('reset.confirmPassword')}>
          <input
            dir="ltr"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        {errorCode && <Alert>{t('error.' + errorCode)}</Alert>}
        {done && <Alert type="success">{t('password.updated')}</Alert>}
        <div className="home-actions gap-top">
          <button className="b b-primary" type="submit" disabled={saving}>
            {saving ? t('reset.setting') : t('password.change')}
          </button>
        </div>
      </form>
    </AccountCard>
  );
}
