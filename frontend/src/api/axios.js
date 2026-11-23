import axios from 'axios';
import { Capacitor } from '@capacitor/core';

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

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
