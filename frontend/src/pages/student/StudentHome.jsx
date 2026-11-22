import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import { Alert, Loading, Stat, Tag } from '../../components/ui';

export default function StudentHome() {
  const { user } = useAuth();
  const { t, pick } = useLanguage();
  const { data: sum, loading } = useFetch('/student/summary');
  const { data: att } = useFetch('/attendance/me');
  const s = user.student;
  const warnings = (att || []).filter((a) => a.warning);

  return (
    <>
      <div className="card">
        <h2>{t('home.welcome')} {pick(user.full_name_ar, user.full_name_en)} 👋</h2>
        <p className="muted">
          {t('student.code')}: <bdi>{s?.student_code}</bdi> · {t('student.department')}: {pick(s?.department_ar, s?.department_en)}
        </p>
      </div>

      {loading || !sum ? <Loading /> : (
        <div className="grid-3 gap-top">
          <Stat label={t('stat.cgpa')} value={sum.standing.cgpa ?? '—'} />
          <Stat label={t('stat.creditsEarned')} value={sum.standing.credits_earned} />
          <Stat
            label={t('stat.currentCredits')}
            value={`${sum.current.credits} / ${sum.max_credits}`}
            hint={sum.semester ? pick(sum.semester.name_ar, sum.semester.name_en) : ''}
          />
        </div>
      )}

      {sum?.semester?.registration_open && (
        <div className="card gap-top row between">
          <span><Tag kind="ok">{t('reg.open')}</Tag> {t('home.regHint')}</span>
          <Link className="b b-primary" to="/student/registration">{t('nav.registration')}</Link>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="gap-top">
          {warnings.map((w) => (
            <Alert key={w.offering_id} type="warn">
              ⚠️ {t('att.warning')}: <strong>{w.code}</strong> — {pick(w.name_ar, w.name_en)} ({w.absent_pct}%)
            </Alert>
          ))}
        </div>
      )}
    </>
  );
}
