import { bigScreenUrl, go } from '../lib/router';
import { sound } from '../lib/sound';
import { useApp, useT } from '../store/store';
import { toast } from '../store/ui';
import { IconBracket, IconGear, IconGrid, IconHome, IconList, IconSoundOff, IconSoundOn, IconTablet, IconTv, IconUndo, IconUsers, Trophy } from './Icons';

export function Logo({ small }: { small?: boolean }) {
  return (
    <span className={`logo ${small ? 'logo-sm' : ''}`}>
      <Trophy size={small ? 34 : 44} />
      <span className="logo-text">
        <span className="logo-main">Kart Cup</span>
        <span className="logo-sub">Manager</span>
      </span>
    </span>
  );
}

export function TopBar({ route }: { route: string }) {
  const t = useT();
  const tour = useApp((s) => s.t);
  const history = useApp((s) => s.history);
  const prefs = useApp((s) => s.prefs);
  const setPrefs = useApp((s) => s.setPrefs);
  const undo = useApp((s) => s.undo);
  const last = history[history.length - 1];
  const items = [
    { id: '', label: t('nav.home'), icon: <IconHome /> },
    { id: 'players', label: t('nav.players'), icon: <IconUsers /> },
    { id: 'rounds', label: t('nav.rounds'), icon: <IconGrid /> },
    { id: 'standings', label: t('nav.standings'), icon: <IconList /> },
    ...(tour?.settings.format === 'league' ? [] : [{ id: 'finals', label: tour?.settings.format === 'knockout' ? t('nav.bracket') : t('nav.finals'), icon: <IconBracket /> }]),
    { id: 'settings', label: t('nav.settings'), icon: <IconGear /> },
  ];
  const active = route === 'heat' ? 'rounds' : route === 'podium' ? (tour?.settings.format === 'league' ? 'standings' : 'finals') : route;
  return (
    <header className="topbar">
      <a href="#/" className="topbar-logo" aria-label={t('app.name')}>
        <Logo small />
      </a>
      {tour && (
        <nav className="topnav" aria-label={t('nav.main')}>
          {items.map((it) => (
            <a key={it.id} href={`#/${it.id}`} className={`topnav-item ${active === it.id ? 'on' : ''}`} aria-current={active === it.id ? 'page' : undefined}>
              {it.icon}
              <span>{it.label}</span>
            </a>
          ))}
        </nav>
      )}
      <div className="topbar-tools">
        {tour && (
          <>
            <button className="tool-btn" onClick={() => go('join')} title={t('nav.kiosk')} aria-label={t('nav.kiosk')}>
              <IconTablet />
            </button>
            <button className="tool-btn" onClick={() => window.open(bigScreenUrl(), 'kart-cup-big-screen', 'popup,width=1280,height=720')} title={t('nav.bigScreen')} aria-label={t('nav.bigScreen')} data-testid="open-big">
              <IconTv />
            </button>
            <button
              className="tool-btn tool-undo"
              disabled={!last}
              onClick={() => {
                const what = undo();
                if (what) {
                  sound.blip();
                  toast(t('toast.undone', { what }));
                }
              }}
              title={last ? t('nav.undoWhat', { what: last.label }) : t('nav.nothingToUndo')}
              aria-label={last ? t('nav.undoWhat', { what: last.label }) : t('nav.nothingToUndo')}
              data-testid="undo"
            >
              <IconUndo />
              <span>{t('nav.undo')}</span>
            </button>
          </>
        )}
        <button className="tool-btn" onClick={() => setPrefs({ sound: !prefs.sound })} aria-pressed={prefs.sound} title={prefs.sound ? t('nav.soundOn') : t('nav.soundOff')} aria-label={prefs.sound ? t('nav.soundOn') : t('nav.soundOff')}>
          {prefs.sound ? <IconSoundOn /> : <IconSoundOff />}
        </button>
        <button className="tool-btn tool-lang" onClick={() => setPrefs({ lang: prefs.lang === 'en' ? 'de' : 'en' })} title={t('nav.language')} data-testid="lang">
          {prefs.lang === 'en' ? 'DE' : 'EN'}
        </button>
      </div>
    </header>
  );
}
