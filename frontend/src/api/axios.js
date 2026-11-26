import axios from 'axios';
import { Capacitor } from '@capacitor/core';
import { createSessionRefresh, shouldRefresh, ACCESS_KEY, REFRESH_KEY } from './refreshSession';

// Vite inlines VITE_API_URL at build time. Include the /api suffix.
// `npm run dev` falls back to the page hostname on port 5000 so a phone on the
// LAN can reach a local API. A production build without VITE_API_URL fails on load.
//
// The Capacitor WebView is a different origin (https://localhost on Android,
// capacitor://localhost on iOS). A relative path or the dev page-host fallback
// would not reach the API. Native builds ignore VITE_API_URL so a local
// frontend/.env cannot point the app at localhost. Set VITE_NATIVE_API_URL
// (include /api) only to override the production API.
const NATIVE_API_URL = 'https://sis-project-production-8d2536d4.up.railway.app/api';

function apiBaseUrl() {
  if (Capacitor.isNativePlatform()) {
    return import.meta.env.VITE_NATIVE_API_URL || NATIVE_API_URL;
  }
  const configured = import.meta.env.VITE_API_URL;
  if (configured) return configured;
  if (import.meta.env.DEV) return `http://${window.location.hostname}:5000/api`;
  throw new Error('VITE_API_URL is required for a production build.');
}

const api = axios.create({
  baseURL: apiBaseUrl(),
});

// One refresh for every 401 that arrives while it is in flight.
// The refresh token goes in the JSON body. A cookie would not be sent from the
// Capacitor WebView (https://localhost) to the Railway API.
const session = createSessionRefresh({
  storage: localStorage,
  postRefresh(refreshToken) {
    const base = String(api.defaults.baseURL || '').replace(/\/+$/, '');
    return axios.post(`${base}/auth/refresh`, { refresh_token: refreshToken });
  },
});

export const storeSession = session.storeSession;
export const clearSession = session.clearSession;

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response && error.response.status;
    // No refresh token: leave the 401 for the existing logged-out path.
    if (!shouldRefresh(original, status, localStorage.getItem(REFRESH_KEY))) {
      return Promise.reject(error);
    }

    original._retry = true;
    try {
      await session.refreshAccessToken();
      return api(original);
    } catch {
      // Failed refresh, or a refresh that lost a race with login/logout.
      // Callers keep the existing 401 path (the initial /auth/me clears the session).
      return Promise.reject(error);
    }
  }
);

export default api;
