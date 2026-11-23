import axios from 'axios';

// Vite inlines VITE_API_URL at build time. Include the /api suffix.
// `npm run dev` falls back to the page hostname on port 5000 so a phone on the
// LAN can reach a local API. A production build without VITE_API_URL fails on load.
function apiBaseUrl() {
  const configured = import.meta.env.VITE_API_URL;
  if (configured) return configured;
  if (import.meta.env.DEV) return `http://${window.location.hostname}:5000/api`;
  throw new Error('VITE_API_URL is required for a production build.');
}

const api = axios.create({
  baseURL: apiBaseUrl(),
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
