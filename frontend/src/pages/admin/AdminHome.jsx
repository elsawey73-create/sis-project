import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import { LoadError, Loading, Stat } from '../../components/ui';
import { isNativeApp } from '../../native/platform';
import { AdminHomeNative } from '../../native/views';

export default function AdminHome() {
  const { t, pick } = useLanguage();
  const { data, error, loading, reload } = useFetch('/admin/stats');
  if (loading) return <Loading />;
  if (error || data == null) return <LoadError error={error} onRetry={reload} />;
  if (isNativeApp()) return <AdminHomeNative data={data} />;
  return (
    <>
      <div className="card">
        <h2 className="m0">{t('nav.dashboard')}</h2>
        <p className="muted">{t('admin.currentSemester')}: {data.semester ? pick(data.semester.name_ar, data.semester.name_en) : '—'}</p>
      </div>
      <div className="grid-3 gap-top">
        <Stat label={t('role.student')} value={data.students} />
        <Stat label={t('role.instructor')} value={data.instructors} />
        <Stat label={t('stat.courses')} value={data.courses} />
        <Stat
          label={t('stat.activeOfferings')}
          value={data.offerings}
          hint={data.semester ? pick(data.semester.name_ar, data.semester.name_en) : t('admin.currentSemester')}
        />
        <Stat label={t('stat.enrollments')} value={data.enrollments} hint={t('admin.currentSemester')} />
      </div>
      <div className="card gap-top">
        <h3 className="m0">{t('home.quickLinks')}</h3>
        <div className="toolbar">
          <Link className="b b-primary" to="/admin/users">{t('nav.users')}</Link>
          <Link className="b b-ghost" to="/admin/catalog">{t('nav.manageCatalog')}</Link>
          <Link className="b b-ghost" to="/admin/offerings">{t('nav.offerings')}</Link>
          <Link className="b b-ghost" to="/catalog">{t('nav.catalog')}</Link>
        </div>
      </div>
    </>
  );
}
