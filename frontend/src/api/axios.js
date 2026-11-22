import axios from 'axios';

// كل الطلبات للباك اند بتعدّي من هنا. العنوان بياخد نفس الـ host اللي الموقع مفتوح عليه
// (عشان الموبايل على نفس الشبكة يقدر يكلم السيرفر). ممكن تغيّره بـ VITE_API_URL.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || `http://${window.location.hostname}:5000/api`,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
