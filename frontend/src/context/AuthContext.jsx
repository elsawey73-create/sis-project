import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/axios';
import { useLanguage, readStoredLang } from './LanguageContext';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { setLang } = useLanguage();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // True until the stored token is checked.

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((res) => {
        setUser(res.data);
        if (res.data.preferred_lang) setLang(res.data.preferred_lang);
      })
      .catch(() => localStorage.removeItem('token')) // Expired or rejected token.
      .finally(() => setLoading(false));
  }, [setLang]);

  async function login(loginId, password) {
    const res = await api.post('/auth/login', { login_id: loginId, password });
    localStorage.setItem('token', res.data.token);
    try {
      const me = await api.get('/auth/me');
      const u = me.data;
      setUser(u);
      // Keep a language chosen on this device, otherwise use the account language.
      const chosen = readStoredLang();
      if (chosen) api.patch('/auth/language', { lang: chosen }).catch(() => {});
      else if (u.preferred_lang) setLang(u.preferred_lang);
      return u;
    } catch (err) {
      localStorage.removeItem('token');
      setUser(null);
      throw err;
    }
  }

  async function logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      /* Clear the local token even when the server rejects logout. */
    }
    localStorage.removeItem('token');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Home path for each role.
export const homeByRole = {
  student: '/student',
  instructor: '/doctor',
  admin: '/admin',
};
