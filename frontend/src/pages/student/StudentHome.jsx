import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import StudentOverview from '../../components/StudentOverview';
import { isNativeApp } from '../../native/platform';
import { StudentHomeNative } from '../../native/views';

export default function StudentHome() {
  const { user } = useAuth();
  const { pick } = useLanguage();
  const summary = useFetch('/student/summary');
  const student = user.student;
  const overview = {
    name: pick(user.full_name_ar, user.full_name_en),
    studentCode: student?.student_code,
    department: pick(student?.department_ar, student?.department_en),
    summary,
  };

  if (isNativeApp()) return <StudentHomeNative {...overview} />;
  return <StudentOverview {...overview} />;
}
