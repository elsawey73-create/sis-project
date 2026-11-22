import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import { Loading, Stat } from '../../components/ui';

export default function AdminHome() {
  const { t, pick } = useLanguage();
  const { data, loading } = useFetch('/admin/stats');
  if (loading || !data) return <Loading />;
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
        <Stat label={t('stat.offerings')} value={data.offerings} />
        <Stat label={t('stat.enrollments')} value={data.enrollments} />
      </div>
      <div className="card gap-top toolbar">
        <Link className="b b-ghost" to="/admin/catalog">{t('nav.manageCatalog')}</Link>
        <Link className="b b-ghost" to="/admin/offerings">{t('nav.offerings')}</Link>
        <Link className="b b-ghost" to="/admin/users">{t('nav.users')}</Link>
      </div>
    </>
  );
}
