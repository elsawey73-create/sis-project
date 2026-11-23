import { useState } from 'react';
import api from '../../api/axios';
import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import { Alert, FetchBody, Field, LoadError } from '../../components/ui';
import { errorText } from '../../utils/format';

const empty = { login_id: '', password: '', full_name_ar: '', full_name_en: '', email: '', role: 'student', department_id: '' };

export default function AdminUsers() {
  const { t, pick } = useLanguage();
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const params = new URLSearchParams();
  if (role) params.set('role', role);
  if (q) params.set('q', q);
  const users = useFetch(`/admin/users?${params}`);
  const depts = useFetch('/departments');
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);

  async function run(fn) {
    setMsg(null);
    try { await fn(); users.reload(); setMsg({ type: 'success', text: t('common.saved') }); }
    catch (e) { setMsg({ type: 'error', text: errorText(e, t) }); }
  }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="card">
      <div className="row between">
        <h2 className="m0">{t('nav.users')}</h2>
        {!form && <button className="b b-primary" onClick={() => setForm(empty)}>+ {t('common.add')}</button>}
      </div>
      <Alert type={msg?.type}>{msg?.text}</Alert>
      {depts.error && <LoadError error={depts.error} onRetry={depts.reload} />}

      {form && (
        <form className="form-grid" onSubmit={(e) => { e.preventDefault(); run(async () => { await api.post('/admin/users', form); setForm(null); }); }}>
          <Field label={t('login.id')}><input required dir="ltr" value={form.login_id} onChange={set('login_id')} /></Field>
          <Field label={t('login.password')}><input required dir="ltr" type="password" value={form.password} onChange={set('password')} /></Field>
          <Field label={t('form.nameAr')}><input required value={form.full_name_ar} onChange={set('full_name_ar')} /></Field>
          <Field label={t('form.nameEn')}><input value={form.full_name_en} onChange={set('full_name_en')} /></Field>
          <Field label={t('users.role')}>
            <select value={form.role} onChange={set('role')}>{['student', 'instructor', 'admin'].map((r) => <option key={r} value={r}>{t('role.' + r)}</option>)}</select>
          </Field>
          {form.role !== 'admin' && (
            <Field label={t('col.department')}>
              <select required value={form.department_id} onChange={set('department_id')}>
                <option value="">—</option>
                {(depts.data || []).map((d) => <option key={d.id} value={d.id}>{pick(d.name_ar, d.name_en)}</option>)}
              </select>
            </Field>
          )}
          <Field label="Email"><input dir="ltr" type="email" value={form.email} onChange={set('email')} /></Field>
          <div className="toolbar span-2">
            <button className="b b-primary">{t('common.save')}</button>
            <button type="button" className="b b-ghost" onClick={() => setForm(null)}>{t('common.cancel')}</button>
          </div>
        </form>
      )}

      <div className="toolbar inline">
        <input placeholder={t('catalog.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">{t('users.allRoles')}</option>
          {['student', 'instructor', 'admin'].map((r) => <option key={r} value={r}>{t('role.' + r)}</option>)}
        </select>
      </div>

      <FetchBody loading={users.loading} error={users.error} data={users.data} onRetry={users.reload}>
        {(list) => (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>ID</th><th>{t('col.name')}</th><th>{t('users.role')}</th><th /></tr></thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={4} className="muted">{t('reg.none')}</td></tr>}
              {list.map((u) => (
                <tr key={u.id}>
                  <td><bdi>{u.login_id}</bdi></td><td>{pick(u.full_name_ar, u.full_name_en)}</td><td>{t('role.' + u.role)}</td>
                  <td>
                    <button className="b b-ghost" onClick={() => {
                      const pw = prompt(t('users.newPassword'));
                      if (pw) run(() => api.put(`/admin/users/${u.id}/password`, { password: pw }));
                    }}>{t('users.resetPw')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </FetchBody>
    </div>
  );
}
