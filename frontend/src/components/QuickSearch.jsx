import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useLanguage } from '../context/LanguageContext';

export default function QuickSearch() {
  const { t, pick } = useLanguage();
  const [q, setQ] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) return undefined;
    let alive = true;
    const timer = window.setTimeout(() => {
      api.get('/search', { params: { q: text } })
        .then((response) => { if (alive) setResult(response.data); })
        .catch(() => { if (alive) setResult({ courses: [], students: [] }); });
    }, 250);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [q]);

  const visible = q.trim().length >= 2 ? result : null;
  const courses = visible?.courses || [];
  const students = visible?.students || [];
  const open = visible != null;

  return (
    <div className="search-pop">
      <input
        className="search-input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('search.placeholder')}
        aria-label={t('search.placeholder')}
      />
      {open && (
        <div className="search-results">
          {courses.length === 0 && students.length === 0 && <p className="muted small">{t('search.none')}</p>}
          {courses.length > 0 && <div className="small muted">{t('search.courses')}</div>}
          {courses.map((course) => (
            <Link key={course.id} to="/catalog" onClick={() => setQ('')}>{course.code} {pick(course.name_ar, course.name_en)}</Link>
          ))}
          {students.length > 0 && <div className="small muted">{t('search.students')}</div>}
          {students.map((student) => (
            <div key={`${student.id}-${student.course_code || ''}`} className="small"><bdi>{student.student_code}</bdi> {pick(student.full_name_ar, student.full_name_en)}</div>
          ))}
        </div>
      )}
    </div>
  );
}
