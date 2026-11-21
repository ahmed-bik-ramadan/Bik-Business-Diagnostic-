import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import '@fontsource/noto-sans-arabic/arabic-400.css';
import '@fontsource/noto-sans-arabic/latin-400.css';
import '@fontsource/noto-sans-arabic/arabic-500.css';
import '@fontsource/noto-sans-arabic/latin-500.css';
import '@fontsource/noto-sans-arabic/arabic-600.css';
import '@fontsource/noto-sans-arabic/latin-600.css';
import '@fontsource/noto-sans-arabic/arabic-700.css';
import '@fontsource/noto-sans-arabic/latin-700.css';
import '@fontsource/noto-sans-arabic/arabic-800.css';
import '@fontsource/noto-sans-arabic/latin-800.css';
import '@fontsource/noto-sans-arabic/arabic-900.css';
import '@fontsource/noto-sans-arabic/latin-900.css';
import '@fontsource/noto-naskh-arabic/arabic-500.css';
import '@fontsource/noto-naskh-arabic/latin-500.css';
import '@fontsource/noto-naskh-arabic/arabic-700.css';
import '@fontsource/noto-naskh-arabic/latin-700.css';
import './index.css';
import { clearBikStorage } from './services/analysisRecovery';

clearBikStorage('localStorage');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
