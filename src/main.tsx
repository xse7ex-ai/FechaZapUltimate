import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './i18n';
import App from './App.tsx';
import { ThemeProvider } from './context/ThemeContext';
import { registerServiceWorker } from './utils/registerSW';
import './index.css';

// Registra o Service Worker do PWA
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);

