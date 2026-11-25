import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import '@fontsource/nunito/latin-900.css';
import './styles/tokens.css';
import './styles/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { parseHash } from './lib/router';
import { startAutosave, useApp } from './store/store';
import { startBroadcast } from './store/sync';
import { translate } from './i18n';

// The big screen window only listens; it must never write the shared storage.
if (parseHash(location.hash)[0] !== 'big') {
  startAutosave();
  startBroadcast();
  window.addEventListener('beforeunload', (e) => {
    const s = useApp.getState();
    if (s.t && s.changeSeq > s.exportSeq) {
      e.preventDefault();
      e.returnValue = translate(s.prefs.lang, 'leave.warning');
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
