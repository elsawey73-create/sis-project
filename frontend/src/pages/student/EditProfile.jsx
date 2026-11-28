import { useState } from 'react';
import api from '../../api/axios';
import { Alert, Field, LoadError, Loading } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import { isNativeApp } from '../../native/platform';
import { errorText } from '../../utils/format';

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

export default function EditProfile() {
  const { user } = useAuth();
  const { t, pick } = useLanguage();
  const { toast } = useFeedback();
  const profile = useFetch('/student/profile');
  const [email, setEmail] = useState('');
  const [source, setSource] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  if (profile.data && source !== profile.data) {
    setSource(profile.data);
    setEmail(profile.data.email || '');
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api.patch('/student/profile', { email });
      setEmail(res.data.email || '');
      toast({ type: 'success', message: t('profile.saved') });
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  const student = user.student;

  return (
    <AccountCard title={t('profile.edit')}>
      <p className="muted">{t('profile.hint')}</p>
      <p className="small">
        {pick(user.full_name_ar, user.full_name_en)}
        {' · '}
        <bdi>{student?.student_code}</bdi>
        {' · '}
        {pick(student?.department_ar, student?.department_en)}
      </p>
      {profile.loading ? <Loading /> : profile.error || profile.data == null ? (
        <LoadError error={profile.error} onRetry={profile.reload} />
      ) : (
        <form onSubmit={onSubmit}>
          <Field label={t('profile.email')}>
            <input
              dir="ltr"
              type="email"
              autoComplete="email"
              maxLength={255}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          {error && <Alert>{errorText(error, t)}</Alert>}
          <div className="home-actions gap-top">
            <button className="b b-primary" type="submit" disabled={saving}>
              {saving ? t('reset.setting') : t('common.save')}
            </button>
          </div>
        </form>
      )}
    </AccountCard>
  );
}
