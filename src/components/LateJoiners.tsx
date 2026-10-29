import { addPlayerToHeat, currentRound, lateJoinSlots, phaseOf } from '../engine/tournament';
import { heatTitle } from '../lib/labels';
import { tNow, useApp, useT } from '../store/store';
import { Avatar } from './Avatar';

/** Checked-in players who are not in the current round: offer free slots in unplayed heats. */
export function LateJoiners() {
  const t = useT();
  const tour = useApp((s) => s.t)!;
  const apply = useApp((s) => s.apply);
  if (phaseOf(tour) !== 'qualifying') return null;
  const round = currentRound(tour);
  if (!round || round.heats.every((h) => h.result)) return null;
  const inRound = new Set(round.heats.flatMap((h) => h.playerIds));
  const late = tour.players.filter((p) => p.status === 'checked-in' && !inRound.has(p.id));
  if (!late.length) return null;
  const slots = lateJoinSlots(tour);
  return (
    <div className="notice notice-late" role="region" aria-label={t('home.lateJoiners')}>
      <strong>{t('home.lateJoiners')}</strong>
      <span>{t('home.lateBody', { names: late.map((p) => p.name).join(', ') })}</span>
      <div className="late-list">
        {late.map((p) => (
          <div key={p.id} className="late-row">
            <Avatar player={p} size={28} /> <b>{p.name}</b>
            {slots.length ? (
              slots.map((h) => (
                <button key={h.id} className="btn btn-sm btn-gold" onClick={() => apply(tNow('action.lateJoin', { name: p.name }), (x) => addPlayerToHeat(x, p.id, h.id))}>
                  {t('home.lateAdd', { name: p.name, heat: heatTitle(t, tour, h.id) })}
                </button>
              ))
            ) : (
              <span className="muted">{t('home.lateNone')}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
