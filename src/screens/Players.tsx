import { useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Card, StatusPill, Toggle } from '../components/Bits';
import { Modal } from '../components/Dialogs';
import { IconEdit, IconPlus, IconTablet } from '../components/Icons';
import { LateJoiners } from '../components/LateJoiners';
import { newDraft, PlayerForm, type PlayerDraft } from '../components/PlayerForm';
import { allHeats, finalsReachForNewPlayer, isNameTaken, lateJoinSlots, normalizeName } from '../engine/tournament';
import type { Player, PlayerStatus } from '../engine/types';
import { heatTitle } from '../lib/labels';
import { go } from '../lib/router';
import { useApp, useT } from '../store/store';
import { confirmDialog, toast } from '../store/ui';

type Filter = 'all' | PlayerStatus;

export function Players() {
  const t = useT();
  const tour = useApp((s) => s.t)!;
  const dispatch = useApp((s) => s.dispatch);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Player | 'new' | null>(null);
  const [quick, setQuick] = useState(false);
  const [offer, setOffer] = useState<Player | null>(null);

  const raced = useMemo(() => new Set(allHeats(tour).flatMap((h) => h.playerIds)), [tour]);
  const list = tour.players
    .filter((p) => filter === 'all' || p.status === filter)
    .filter((p) => {
      const q = query.trim().toLowerCase();
      return !q || p.name.toLowerCase().includes(q) || p.tag.toLowerCase().includes(q);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const count = (s: PlayerStatus) => tour.players.filter((p) => p.status === s).length;

  const offerLateSlot = (p: Player) => {
    const state = useApp.getState().t!;
    if (state.rounds.length && lateJoinSlots(state).length && p.status === 'checked-in') setOffer(p);
  };

  const withdraw = async (p: Player) => {
    if (await confirmDialog({ title: t('players.withdraw'), body: t('players.withdrawConfirm', { name: p.name }), danger: true, confirmLabel: t('players.withdraw') })) {
      dispatch({ type: 'withdraw', id: p.id });
    }
  };
  const remove = async (p: Player) => {
    if (await confirmDialog({ title: t('common.delete'), body: t('players.deleteConfirm', { name: p.name }), danger: true, confirmLabel: t('common.delete') })) {
      dispatch({ type: 'deletePlayer', id: p.id });
    }
  };

  return (
    <div className="players">
      <div className="page-head">
        <h1 className="display page-title">{t('players.title')}</h1>
        <div className="btn-row">
          <button className="btn btn-gold" onClick={() => setEditing('new')} data-testid="add-player">
            <IconPlus /> {t('players.addPlayers')}
          </button>
          <button className="btn btn-sky" onClick={() => setQuick(true)} data-testid="quick-add">
            {t('players.quickAdd')}
          </button>
          <button className="btn btn-white" onClick={() => go('join')}>
            <IconTablet /> {t('nav.kiosk')}
          </button>
        </div>
      </div>
      <LateJoiners />
      <Card>
        <div className="list-tools">
          <input type="search" className="search" placeholder={t('players.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('common.search')} />
          <div className="filter-chips" role="group">
            {(['all', 'registered', 'checked-in', 'active', 'withdrawn'] as Filter[]).map((f) => (
              <button key={f} className={`chip chip-btn ${filter === f ? 'on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === 'all' ? t('common.all') : t(`players.status.${f}`)} <b>{f === 'all' ? tour.players.length : count(f)}</b>
              </button>
            ))}
          </div>
        </div>
        <p className="muted">{t('players.count', { n: tour.players.length, c: count('checked-in'), a: count('active') })}</p>
        {tour.players.length === 0 ? (
          <p className="empty">{t('players.empty')}</p>
        ) : list.length === 0 ? (
          <p className="empty">{t('players.noMatch')}</p>
        ) : (
          <ul className="player-list">
            {list.map((p) => (
              <li key={p.id} className={`player-row status-${p.status}`} data-testid="player-row">
                <Avatar player={p} size={44} />
                <div className="player-main">
                  <strong>{p.name}</strong>
                  {p.tag && <span className="tag">{p.tag}</span>}
                  {p.status === 'checked-in' && tour.rounds.length > 0 && <small className="muted"> · {t('players.joinsRound', { n: p.joinedRound + 1 })}</small>}
                </div>
                <StatusPill status={p.status} />
                {(p.status === 'registered' || p.status === 'checked-in') && (
                  <Toggle
                    checked={p.status === 'checked-in'}
                    label={t('players.checkIn')}
                    testId={`checkin-${p.name}`}
                    onChange={(v) => {
                      dispatch({ type: 'setCheckedIn', id: p.id, on: v });
                      if (v) offerLateSlot({ ...p, status: 'checked-in' });
                    }}
                  />
                )}
                <div className="row-actions">
                  <button className="icon-btn" onClick={() => setEditing(p)} aria-label={`${t('common.edit')} ${p.name}`}>
                    <IconEdit />
                  </button>
                  {p.status === 'withdrawn' ? (
                    <button
                      className="btn btn-sm btn-white"
                      onClick={() => {
                        dispatch({ type: 'reinstate', id: p.id });
                        toast(t('players.reinstated', { name: p.name }));
                      }}
                    >
                      {t('players.reinstate')}
                    </button>
                  ) : raced.has(p.id) ? (
                    <button className="btn btn-sm btn-white btn-danger-text" onClick={() => void withdraw(p)} data-testid={`withdraw-${p.name}`}>
                      {t('players.withdraw')}
                    </button>
                  ) : (
                    <button className="btn btn-sm btn-white btn-danger-text" onClick={() => void remove(p)}>
                      {t('common.delete')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && (
        <EditPlayer
          player={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onAdded={(p) => {
            setEditing(null);
            offerLateSlot(p);
          }}
        />
      )}
      {quick && <QuickAdd onClose={() => setQuick(false)} />}
      {offer && <LateOffer player={offer} onClose={() => setOffer(null)} />}
    </div>
  );
}

function EditPlayer({ player, onClose, onAdded }: { player: Player | null; onClose: () => void; onAdded: (p: Player) => void }) {
  const t = useT();
  const tour = useApp((s) => s.t)!;
  const dispatch = useApp((s) => s.dispatch);
  const [draft, setDraft] = useState<PlayerDraft>(() => (player ? { name: player.name, tag: player.tag, color: player.color } : newDraft(tour.players)));
  const [checkIn, setCheckIn] = useState(true);
  const [error, setError] = useState('');
  const save = () => {
    const name = normalizeName(draft.name);
    if (!name) return setError(t('kiosk.err.name-required'));
    if (isNameTaken(tour, name, player?.id)) return setError(t('kiosk.err.name-taken'));
    if (player) {
      dispatch({ type: 'updatePlayer', id: player.id, patch: draft });
      onClose();
    } else {
      const r = dispatch({ type: 'addPlayer', player: { ...draft, status: checkIn ? 'checked-in' : 'registered' } });
      const state = useApp.getState().t!;
      const added = r.ok ? state.players.find((p) => p.id === r.playerId) : undefined;
      const reach = finalsReachForNewPlayer(state);
      if (added && !reach.ok) toast(t('signup.noFinals', { needed: reach.needed, possible: reach.possible }));
      if (added) onAdded(added);
    }
  };
  return (
    <Modal
      wide
      title={player ? t('players.editTitle') : t('players.addPlayers')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-white" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-green" onClick={save} data-testid="save-player">
            {t('common.save')}
          </button>
        </>
      }
    >
      <PlayerForm draft={draft} onChange={(d) => { setDraft(d); setError(''); }} error={error} />
      {!player && <Toggle checked={checkIn} onChange={setCheckIn} label={t('players.quickAddCheckIn')} />}
    </Modal>
  );
}

function QuickAdd({ onClose }: { onClose: () => void }) {
  const t = useT();
  const dispatch = useApp((s) => s.dispatch);
  const [text, setText] = useState('');
  const [checkIn, setCheckIn] = useState(false);
  const add = () => {
    const names = text.split(/\r?\n/).map(normalizeName).filter(Boolean);
    // Colours are picked by the engine: the least-used one for each new player.
    const r = dispatch({ type: 'addPlayers', players: names.map((name) => ({ name, status: checkIn ? 'checked-in' : 'registered' })) });
    const added = r.ok ? (r.added ?? 0) : 0;
    const skipped = r.ok ? (r.skipped ?? []) : names;
    toast(t('players.quickAdded', { n: added }), 'success');
    if (skipped.length) toast(t('players.quickSkipped', { names: skipped.join(', ') }), 'error');
    onClose();
  };
  return (
    <Modal
      title={t('players.quickAdd')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-white" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-green" onClick={add} disabled={!text.trim()} data-testid="quick-add-save">
            {t('players.addPlayers')}
          </button>
        </>
      }
    >
      <p className="muted">{t('players.quickAddHint')}</p>
      <textarea className="quick-text" rows={10} value={text} onChange={(e) => setText(e.target.value)} data-autofocus aria-label={t('players.quickAdd')} data-testid="quick-add-text" />
      <Toggle checked={checkIn} onChange={setCheckIn} label={t('players.quickAddCheckIn')} testId="quick-add-checkin" />
    </Modal>
  );
}

function LateOffer({ player, onClose }: { player: Player; onClose: () => void }) {
  const t = useT();
  const tour = useApp((s) => s.t)!;
  const dispatch = useApp((s) => s.dispatch);
  const slots = lateJoinSlots(tour);
  return (
    <Modal title={t('players.lateOfferTitle', { name: player.name })} onClose={onClose} footer={<button className="btn btn-white" onClick={onClose} data-testid="late-later">{t('players.lateLater')}</button>}>
      <p>{t('players.lateOfferBody', { name: player.name })}</p>
      <div className="btn-col">
        {slots.map((h) => (
          <button
            key={h.id}
            className="btn btn-gold"
            onClick={() => {
              dispatch({ type: 'lateJoin', playerId: player.id, heatId: h.id });
              onClose();
            }}
          >
            {heatTitle(t, tour, h.id)} · {h.playerIds.length}/{tour.settings.heatSize}
          </button>
        ))}
      </div>
    </Modal>
  );
}
