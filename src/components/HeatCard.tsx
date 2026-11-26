import { useState } from 'react';
import { canMovePlayer, scoreOf } from '../engine/tournament';
import type { Heat, Tournament } from '../engine/types';
import { heatTitle } from '../lib/labels';
import { heatStatus } from '../lib/queue';
import { go } from '../lib/router';
import { useApp, useT } from '../store/store';
import { Avatar } from './Avatar';
import { PosBadge } from './Bits';
import { HeatCup } from './Cup';
import { Clover, IconDown, IconEdit, IconMove, IconUp } from './Icons';

interface Props {
  tour: Tournament;
  heat: Heat;
  /** Sibling heats (same round/stage) for reorder and move controls. */
  siblings?: Heat[];
  controls?: boolean;
  /** Finals: how many of this heat advance (highlighted after the result). */
  advance?: number;
  seeds?: string[];
  index?: number;
  /** Players who got in as best of the rest (clover mark). */
  lucky?: Set<string>;
}

export function HeatCard({ tour, heat, siblings = [], controls = true, advance, seeds, index = 0, lucky }: Props) {
  const t = useT();
  const dispatch = useApp((s) => s.dispatch);
  const [moving, setMoving] = useState<string | null>(null);
  const status = heatStatus(tour, heat);
  const scores = scoreOf(tour, heat);
  const byId = new Map(tour.players.map((p) => [p.id, p]));
  const pos = siblings.findIndex((h) => h.id === heat.id);
  const prev = siblings[pos - 1];
  const next = siblings[pos + 1];
  const rows = scores ? scores.map((s) => ({ id: s.playerId, place: s.place, points: s.points })) : heat.playerIds.map((id) => ({ id, place: 0, points: 0 }));

  return (
    <article className={`heat-card heat-${status}`} style={{ animationDelay: `${index * 60}ms` }} data-testid="heat-card">
      <header className="heat-head">
        <h3 className="ribbon ribbon-blue">{heatTitle(t, tour, heat.id)}</h3>
        <span className={`heat-status status-${status}`}>{t(`heat.status.${status}`)}</span>
      </header>
      <HeatCup tour={tour} heat={heat} compact />
      <ul className="heat-players">
        {rows.map((r) => {
          const p = byId.get(r.id);
          if (!p) return null;
          const adv = advance !== undefined && r.place > 0 && r.place <= advance;
          const seed = seeds ? seeds.indexOf(r.id) + 1 : 0;
          return (
            <li key={r.id} className={`heat-player ${adv ? 'advances' : ''} ${p.status === 'withdrawn' ? 'is-withdrawn' : ''}`}>
              {r.place > 0 ? <PosBadge pos={r.place} size="sm" /> : seed > 0 ? <span className="seed" title={t('finals.seed', { n: seed })}>{seed}</span> : null}
              <Avatar player={p} size={30} />
              <span className="heat-player-name">
                {p.name}
                {p.tag && <small> {p.tag}</small>}
                {lucky?.has(r.id) && (
                  <span className="lucky-mark" title={t('ko.lucky')} aria-label={t('ko.lucky')} role="img">
                    <Clover size={16} />
                  </span>
                )}
              </span>
              {r.place > 0 && <span className="heat-points">{r.points}</span>}
              {adv && <span className="adv-flag" title={t('finals.advances')}>➜</span>}
              {controls && status !== 'done' && siblings.length > 1 && !heat.result && (
                <button className="icon-btn icon-btn-sm" onClick={() => setMoving(moving === r.id ? null : r.id)} aria-label={t('heat.movePlayer', { name: p.name })} aria-expanded={moving === r.id}>
                  <IconMove size={16} />
                </button>
              )}
              {moving === r.id && (
                <div className="move-menu" role="menu">
                  <span className="move-title">{t('heat.movePlayer', { name: p.name })}</span>
                  {siblings.filter((h) => h.id !== heat.id && canMovePlayer(tour, r.id, h.id)).map((h) => (
                    <button
                      key={h.id}
                      role="menuitem"
                      className="btn btn-sm btn-white"
                      onClick={() => {
                        dispatch({ type: 'movePlayer', playerId: r.id, heatId: h.id });
                        setMoving(null);
                      }}
                    >
                      {heatTitle(t, tour, h.id)}
                    </button>
                  ))}
                  {!siblings.some((h) => h.id !== heat.id && canMovePlayer(tour, r.id, h.id)) && <span className="muted">{t('heat.noMoves')}</span>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {controls && (
        <footer className="heat-foot">
          {!heat.result && (
            <span className="heat-order">
              <button className="icon-btn" disabled={!prev || !!prev.result} onClick={() => dispatch({ type: 'swapHeats', a: heat.id, b: prev.id })} aria-label={t('heat.moveUp')} title={t('heat.moveUp')}>
                <IconUp />
              </button>
              <button className="icon-btn" disabled={!next || !!next.result} onClick={() => dispatch({ type: 'swapHeats', a: heat.id, b: next.id })} aria-label={t('heat.moveDown')} title={t('heat.moveDown')}>
                <IconDown />
              </button>
            </span>
          )}
          <button className={`btn btn-sm ${heat.result ? 'btn-white' : status === 'now' ? 'btn-red' : 'btn-sky'}`} onClick={() => go(`heat/${heat.id}`)} data-testid="enter-results">
            {heat.result ? <IconEdit size={18} /> : null}
            {heat.result ? t('heat.editResults') : t('home.enterResults')}
          </button>
        </footer>
      )}
    </article>
  );
}
