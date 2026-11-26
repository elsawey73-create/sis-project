import { Capacitor } from '@capacitor/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './native/native.css';
import App from './App.jsx';

if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('native-app');
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
