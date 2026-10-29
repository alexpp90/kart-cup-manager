import { useEffect } from 'react';
import { ConfirmHost, Toasts } from './components/Dialogs';
import { PhaseBar } from './components/PhaseBar';
import { TopBar } from './components/TopBar';
import { useRoute } from './lib/router';
import { BigScreen } from './screens/BigScreen';
import { Finals } from './screens/Finals';
import { Home } from './screens/Home';
import { Kiosk } from './screens/Kiosk';
import { Players } from './screens/Players';
import { Podium } from './screens/Podium';
import { ResultEntry } from './screens/ResultEntry';
import { Rounds } from './screens/Rounds';
import { SettingsScreen } from './screens/Settings';
import { Setup } from './screens/Setup';
import { Standings } from './screens/Standings';
import { Welcome } from './screens/Welcome';
import { useApp, useT } from './store/store';

export function App() {
  const route = useRoute();
  const t = useApp((s) => s.t);
  const lang = useApp((s) => s.prefs.lang);
  const tr = useT();
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route[0], route[1]]);

  const [page, arg] = route;
  if (page === 'big') return <BigScreen />;

  let content;
  if (!t) content = page === 'setup' ? <Setup /> : <Welcome />;
  else if (page === 'join') {
    return (
      <>
        <Kiosk />
        <ConfirmHost />
        <Toasts />
      </>
    );
  } else {
    switch (page) {
      case 'players':
        content = <Players />;
        break;
      case 'rounds':
        content = <Rounds roundIndex={arg !== undefined ? Number(arg) : undefined} />;
        break;
      case 'heat':
        content = <ResultEntry key={arg} heatId={arg ?? ''} />;
        break;
      case 'standings':
        content = <Standings />;
        break;
      case 'finals':
        content = <Finals />;
        break;
      case 'podium':
        content = <Podium />;
        break;
      case 'settings':
        content = <SettingsScreen />;
        break;
      case 'setup':
        content = <Setup />;
        break;
      default:
        content = <Home />;
    }
  }
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        {tr('nav.skip')}
      </a>
      <TopBar route={page ?? ''} />
      {t && page !== 'setup' && <PhaseBar t={t} />}
      <main id="main" className="main" tabIndex={-1}>
        {content}
      </main>
      <ConfirmHost />
      <Toasts />
    </div>
  );
}
