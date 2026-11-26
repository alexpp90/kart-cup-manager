import { useEffect } from 'react';
import type { Player } from '../engine/types';
import { sound } from '../lib/sound';
import { Avatar } from './Avatar';
import { PosBadge } from './Bits';

interface Props {
  players: Player[];
  order: string[];
  onChange: (order: string[]) => void;
  /** Called once the order is complete (the last player was auto-filled). */
  onComplete?: (order: string[]) => void;
  keyboard?: boolean;
  /** Key / label per player (the controller numbers); default 1..n. */
  keys?: number[];
}

/** Big tap targets: tap racers in finishing order, the last one fills in automatically. */
export function TapOrder({ players, order, onChange, onComplete, keyboard = true, keys }: Props) {
  const keyOf = (i: number) => keys?.[i] ?? i + 1;
  const tap = (id: string) => {
    if (order.includes(id)) return;
    let next = [...order, id];
    if (next.length === players.length - 1) {
      const rest = players.find((p) => !next.includes(p.id));
      if (rest) next = [...next, rest.id];
    }
    sound.tap();
    onChange(next);
    if (next.length === players.length) onComplete?.(next);
  };

  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[1-9]$/.test(e.key)) {
        const p = players.find((_, i) => keyOf(i) === Number(e.key));
        if (p) {
          e.preventDefault();
          tap(p.id);
        }
      } else if (e.key === 'Backspace' && order.length) {
        e.preventDefault();
        // Undo also removes an auto-filled last place.
        onChange(order.length === players.length ? order.slice(0, -2) : order.slice(0, -1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="tap-grid" data-count={players.length}>
      {players.map((p, i) => {
        const place = order.indexOf(p.id) + 1;
        return (
          <button
            key={p.id}
            type="button"
            className={`tap-tile ${place ? 'tap-done' : ''}`}
            onClick={() => tap(p.id)}
            aria-pressed={!!place}
            aria-label={place ? `${p.name}: ${place}` : p.name}
            style={{ ['--c' as string]: p.color }}
            data-testid={`tap-${p.name}`}
          >
            <span className="tap-key">{keyOf(i)}</span>
            <Avatar player={p} size={56} />
            <span className="tap-name">{p.name}</span>
            {place > 0 && (
              <span className="tap-place">
                <PosBadge pos={place} size="lg" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
