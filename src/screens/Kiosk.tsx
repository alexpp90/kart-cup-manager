import { useEffect, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Coin, Flag, ItemBox, Star } from '../components/Icons';
import { PlayerForm, randomDraft, type PlayerDraft } from '../components/PlayerForm';
import { addPlayer, isNameTaken, phaseOf } from '../engine/tournament';
import { go } from '../lib/router';
import { sound } from '../lib/sound';
import { newId, tNow, useApp, useT } from '../store/store';

export function Kiosk() {
  const t = useT();
  const tour = useApp((s) => s.t)!;
  const [draft, setDraft] = useState<PlayerDraft>(randomDraft);
  const [error, setError] = useState('');
  const [welcome, setWelcome] = useState<PlayerDraft | null>(null);
  const closed = tour.finals !== null;
  const count = tour.players.filter((p) => p.status !== 'withdrawn').length;

  useEffect(() => {
    if (!welcome) return;
    const id = setTimeout(() => setWelcome(null), 3200);
    return () => clearTimeout(id);
  }, [welcome]);

  useEffect(() => {
    if (error && !isNameTaken(tour, draft.name)) setError('');
  }, [draft.name, error, tour]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    let result: ReturnType<typeof addPlayer> | null = null;
    useApp.getState().apply(tNow('action.addPlayer', { name: draft.name.trim() }), (x) => {
      result = addPlayer(x, { ...draft, status: x.settings.kioskAutoCheckIn ? 'checked-in' : 'registered' }, newId(), Date.now());
      return result.ok ? result.t : x;
    });
    const r = result as ReturnType<typeof addPlayer> | null;
    if (!r) return;
    if (!r.ok) {
      setError(t(`kiosk.err.${r.error}`));
      document.querySelector<HTMLInputElement>('[data-testid=player-name]')?.focus();
      sound.error();
      return;
    }
    sound.fanfare();
    setWelcome({ ...draft, name: r.player.name });
    setDraft(randomDraft());
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
      {closed || phaseOf(tour) === 'podium' ? (
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
              <Avatar avatar={draft.avatar} color={draft.color} size={140} className="license-avatar" />
              <div className="license-name">{draft.name.trim() || t('kiosk.namePlaceholder')}</div>
              {draft.tag && <div className="license-tag">{draft.tag}</div>}
              {draft.favorite && <div className="license-fav">♥ {draft.favorite}</div>}
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
            <Avatar avatar={welcome.avatar} color={welcome.color} size={160} className="pop-in" />
            <p>{t('kiosk.welcome')}</p>
            <strong className="display">{welcome.name}!</strong>
            <small>{t('kiosk.welcomeBody')}</small>
          </div>
        </div>
      )}
    </div>
  );
}
