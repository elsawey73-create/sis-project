import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { GRADUATION_HOURS, REGULAR_LOAD_HOURS, formatHours, graduationProgress } from '../utils/academic';
import { LoadError, Loading } from './ui';

function Metric({ native, label, value, phrase, span }) {
  const valueClass = phrase ? ' is-phrase' : '';
  if (native) {
    return (
      <article className={`native-metric native-card${span ? ' home-span' : ''}`}>
        <div className={`native-metric-value${valueClass}`}>{value}</div>
        <div className="native-metric-label">{label}</div>
      </article>
    );
  }
  return (
    <div className={`stat${span ? ' home-span' : ''}`}>
      <div className={`stat-value${valueClass}`}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function HoursValue({ current }) {
  const { t } = useLanguage();
  return (
    <span className="home-hours">
      <bdi>{current}</bdi>
      <span>{t('home.outOf')}</span>
      <bdi>{REGULAR_LOAD_HOURS}</bdi>
    </span>
  );
}

export default function StudentOverview({ native, name, studentCode, department, summary }) {
  const { t } = useLanguage();
  const sum = summary.data;
  const progress = sum ? graduationProgress(sum.standing?.credits_earned) : null;
  const registered = sum ? formatHours(sum.current?.credits) : null;
  const card = native ? 'native-card' : 'card';

  return (
    <div className={native ? 'native-stack' : 'home-stack'}>
      <section className={native ? 'native-hero native-card' : 'card home-identity'}>
        <p className={native ? 'native-kicker' : 'home-kicker'}>{t('home.welcome')}</p>
        <h2 className="m0">{name}</h2>
        <p className="muted">
          {t('student.code')}: <bdi>{studentCode || '—'}</bdi>
          {' · '}
          {t('student.department')}: {department || '—'}
        </p>
      </section>

      {summary.loading ? <Loading /> : summary.error || !sum ? (
        <LoadError error={summary.error} onRetry={summary.reload} />
      ) : (
        <>
          <div className={native ? 'native-metrics home-metrics' : 'home-stats'}>
            <Metric native={native} label={t('stat.cgpa')} value={sum.standing?.cgpa ?? '—'} />
            <Metric native={native} label={t('stat.creditsEarned')} value={formatHours(sum.standing?.credits_earned)} />
            <Metric
              native={native}
              span={native}
              phrase
              label={t('home.registeredHours')}
              value={<HoursValue current={registered} />}
            />
          </div>
          <section className={card}>
            <div className="home-progress-head">
              <h3 className="m0">{t('home.graduation')}</h3>
              <strong><bdi>{formatHours(progress.earned)}/{GRADUATION_HOURS}</bdi></strong>
            </div>
            <div
              className="home-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={GRADUATION_HOURS}
              aria-valuenow={Math.min(progress.earned, GRADUATION_HOURS)}
              aria-label={t('home.graduation')}
            >
              <span style={{ width: `${progress.percent}%` }} />
            </div>
          </section>
        </>
      )}

      <div className={native ? 'native-actions' : 'home-actions'}>
        <Link className="b b-primary" to="/student/profile">{t('profile.edit')}</Link>
        <Link className="b b-ghost" to="/student/password">{t('password.change')}</Link>
      </div>
    </div>
  );
}
