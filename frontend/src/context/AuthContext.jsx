import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/axios';
import { useLanguage, readStoredLang } from './LanguageContext';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { setLang } = useLanguage();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // بنتأكد من التوكن أول ما الموقع يفتح

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
      .catch(() => localStorage.removeItem('token')) // توكن منتهي أو غلط
      .finally(() => setLoading(false));
  }, [setLang]);

  async function login(loginId, password) {
    const res = await api.post('/auth/login', { login_id: loginId, password });
    localStorage.setItem('token', res.data.token);
    const u = res.data.user;
    setUser(u);

    // لو المستخدم اختار لغة على الجهاز ده نحفظها في حسابه، وإلا نستخدم لغة حسابه
    const chosen = readStoredLang();
    if (chosen) api.patch('/auth/language', { lang: chosen }).catch(() => {});
    else if (u.preferred_lang) setLang(u.preferred_lang);

    return u;
  }

  function logout() {
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

// الصفحة الرئيسية لكل دور
export const homeByRole = {
  student: '/student',
  instructor: '/doctor',
  admin: '/admin',
};
