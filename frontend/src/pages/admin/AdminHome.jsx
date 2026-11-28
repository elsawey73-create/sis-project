import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import { LoadError, Loading, Stat } from '../../components/ui';
import { isNativeApp } from '../../native/platform';
import { AdminHomeNative } from '../../native/views';
import { downloadFile } from '../../utils/download';
import { useFeedback } from '../../context/FeedbackContext';

export default function AdminHome() {
  const { t, pick } = useLanguage();
  const { data, error, loading, reload } = useFetch('/admin/stats');
  const activity = useFetch('/admin/activity');
  const settings = useFetch('/admin/settings');
  const { toast } = useFeedback();
  const [form, setForm] = useState(null);
  if (loading) return <Loading />;
  if (error || data == null) return <LoadError error={error} onRetry={reload} />;
  const values = form || {
    attendance_radius_m: settings.data?.attendance_radius_m ?? '',
    attendance_accuracy_cap_m: settings.data?.attendance_accuracy_cap_m ?? '',
    absence_limit_pct: settings.data?.absence_limit_pct ?? '',
  };
  const marks = Number(data.attendance_marks) || 0;
  const rate = data.enrollments && data.closed_sessions
    ? Math.round((marks / (Number(data.enrollments) * Number(data.closed_sessions))) * 1000) / 10
    : null;
  return (
    <>
      {isNativeApp() && <AdminHomeNative data={data} />}
      {!isNativeApp() && (
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
        <Stat label={t('admin.attendanceRate')} value={rate == null ? '—' : `${rate}%`} />
        <Stat label={t('admin.averageGrade')} value={data.average_grade ?? '—'} />
        <Stat label={t('admin.openSessions')} value={data.open_sessions ?? 0} />
      </div>
      </>
      )}
      <div className="card gap-top">
        <h3 className="m0">{t('admin.settings')}</h3>
        <form className="row" onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.put('/admin/settings', values);
            toast({ type: 'success', message: t('common.saved') });
            settings.reload();
          } catch {
            toast({ type: 'error', message: t('error.SERVER_ERROR') });
          }
        }}>
          <label className="field"><span>{t('admin.radius')}</span><input value={values.attendance_radius_m} onChange={(e) => setForm({ ...values, attendance_radius_m: e.target.value })} /></label>
          <label className="field"><span>{t('admin.accuracy')}</span><input value={values.attendance_accuracy_cap_m} onChange={(e) => setForm({ ...values, attendance_accuracy_cap_m: e.target.value })} /></label>
          <label className="field"><span>{t('admin.absenceLimit')}</span><input value={values.absence_limit_pct} onChange={(e) => setForm({ ...values, absence_limit_pct: e.target.value })} /></label>
          <button className="b b-primary" type="submit">{t('common.save')}</button>
        </form>
        <p className="muted small">{t('admin.backupHint')}</p>
        <button type="button" className="b b-ghost" onClick={() => downloadFile('/admin/backup', 'unidex-backup.json')}>{t('admin.backup')}</button>
      </div>
      <div className="card gap-top">
        <h3 className="m0">{t('admin.activity')}</h3>
        <div className="table-wrap">
          <table className="table table-cards">
            <tbody>
              {(activity.data || []).slice(0, 12).map((row) => (
                <tr key={row.id}>
                  <td data-label={t('col.name')}>{pick(row.full_name_ar, row.full_name_en) || row.login_id || '—'}</td>
                  <td data-label={t('admin.activity')}>{row.action}</td>
                  <td data-label={t('att.date')}>{String(row.created_at).replace('T', ' ').slice(0, 16)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
