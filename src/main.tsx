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
import { startPhoneSync } from './lib/server';
import { PREFS_KEY, startAutosave, useApp } from './store/store';
import { startBroadcast } from './store/sync';
import { translate } from './i18n';

// The big screen only listens, and the guest pages (phone sign-up, the
// station on the server's screen) have no tournament: none of them write storage.
const page = parseHash(location.hash)[0];
if (page === 's' || page === 'desk') {
  if (!localStorage.getItem(PREFS_KEY) && /^de\b/i.test(navigator.language)) useApp.getState().setPrefs({ lang: 'de' });
} else if (page !== 'big') {
  startAutosave();
  startBroadcast();
  startPhoneSync();
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
