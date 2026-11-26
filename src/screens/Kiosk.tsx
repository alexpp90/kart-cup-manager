import { useEffect, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Coin, Flag, ItemBox, Star } from '../components/Icons';
import { newDraft, PlayerForm, type PlayerDraft } from '../components/PlayerForm';
import { finalsReachForNewPlayer, isNameTaken, registrationOpen } from '../engine/tournament';
import { go } from '../lib/router';
import { sound } from '../lib/sound';
import { useApp, useT } from '../store/store';

export function Kiosk() {
  const t = useT();
  const tour = useApp((s) => s.t)!;
  const [draft, setDraft] = useState<PlayerDraft>(() => newDraft(tour.players));
  const [error, setError] = useState('');
  const [welcome, setWelcome] = useState<{ id: string; name: string; color: string; noFinals?: { needed: number; possible: number } } | null>(null);
  const closed = !registrationOpen(tour);
  const count = tour.players.filter((p) => p.status !== 'withdrawn').length;

  useEffect(() => {
    if (!welcome) return;
    const id = setTimeout(() => setWelcome(null), welcome.noFinals ? 7000 : 3200);
    return () => clearTimeout(id);
  }, [welcome]);

  useEffect(() => {
    if (error && !isNameTaken(tour, draft.name)) setError('');
  }, [draft.name, error, tour]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = useApp.getState().dispatch({ type: 'addPlayer', player: { ...draft, status: tour.settings.kioskAutoCheckIn ? 'checked-in' : 'registered' } });
    if (!r.ok) {
      setError(t(r.error === 'name-taken' ? 'kiosk.err.name-taken' : 'kiosk.err.name-required'));
      document.querySelector<HTMLInputElement>('[data-testid=player-name]')?.focus();
      sound.error();
      return;
    }
    sound.fanfare();
    const reach = finalsReachForNewPlayer(useApp.getState().t!);
    const name = r.t.players.find((p) => p.id === r.playerId)?.name ?? draft.name;
    const after = useApp.getState().t!;
    setWelcome({ id: r.playerId!, name, color: after.players.find((p) => p.id === r.playerId)?.color ?? draft.color, noFinals: reach.ok ? undefined : reach });
    setDraft(newDraft(after.players));
  };

  return (
    <div className="kiosk">
      <div className="kiosk-deco" aria-hidden="true">
        <ItemBox size={70} className="deco deco-1" />
        <Coin size={44} className="deco deco-2" />
        <Star size={54} className="deco deco-3" />
        <Flag size={60} className="deco deco-4" />
      </div>
      <header className="kiosk-head">
        <h1 className="display kiosk-title">{t('kiosk.title')}</h1>
        <p className="kiosk-sub">{t('kiosk.subtitle')}</p>
      </header>
      {closed ? (
        <div className="card kiosk-card">
          <p className="now-title">{t('kiosk.closed')}</p>
        </div>
      ) : (
        <form className="kiosk-body" onSubmit={submit}>
          <div className="card kiosk-card">
            <PlayerForm draft={draft} onChange={setDraft} error={error} big autoFocus />
          </div>
          <aside className="kiosk-side">
            <div className="license" aria-label={t('kiosk.preview')}>
              <div className="license-top">{t('kiosk.preview')}</div>
              <Avatar name={draft.name.trim() || '?'} color={draft.color} size={140} className="license-avatar" />
              <div className="license-name">{draft.name.trim() || t('kiosk.namePlaceholder')}</div>
              {draft.tag && <div className="license-tag">{draft.tag}</div>}
            </div>
            <button type="submit" className="btn btn-red btn-xl btn-block kiosk-submit" data-testid="kiosk-submit">
              {t('kiosk.submit')} 🏁
            </button>
            <p className="kiosk-count">{t('kiosk.count', { n: count })}</p>
          </aside>
        </form>
      )}
      <button className="kiosk-exit" onClick={() => go('players')}>
        {t('kiosk.exit')}
      </button>
      {welcome && (
        <div className="kiosk-welcome" role="status" onClick={() => setWelcome(null)}>
          <div className="kiosk-welcome-card">
            <Avatar player={welcome} size={160} className="pop-in" marks={false} />
            <p>{t('kiosk.welcome')}</p>
            <strong className="display">{welcome.name}!</strong>
            <small>{t('kiosk.welcomeBody')}</small>
            {welcome.noFinals && (
              <p className="notice notice-warn" data-testid="no-finals">
                {t('signup.noFinals', { needed: welcome.noFinals.needed, possible: welcome.noFinals.possible })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
