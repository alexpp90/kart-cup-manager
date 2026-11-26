// A player's badge: their colour with their initials, plus the marks they
// earned tonight. No game characters: everyone picks theirs on the console.
import { badgeTextColor, initialsForNew, initialsMap, playerMarks, type Mark } from '../engine/identity';
import type { Player, Tournament } from '../engine/types';
import { useApp, useT } from '../store/store';
import { Clover, Crown, Flame } from './Icons';

interface Props {
  /** A player of the tournament (marks and unique initials come from the current tournament). */
  player?: Pick<Player, 'id' | 'name' | 'color'>;
  /** A name that is not a player yet (sign-up preview). */
  name?: string;
  color?: string;
  size?: number;
  className?: string;
  /** Show earned marks (default: on for players at 28 px and up). */
  marks?: boolean;
}

const initialsCache = new WeakMap<Tournament, Map<string, string>>();
const marksCache = new WeakMap<Tournament, Map<string, Mark[]>>();

function cached<V>(cache: WeakMap<Tournament, V>, t: Tournament, make: (t: Tournament) => V): V {
  let v = cache.get(t);
  if (!v) {
    v = make(t);
    cache.set(t, v);
  }
  return v;
}

export function useInitials(player?: Pick<Player, 'id' | 'name'>, name?: string): string {
  const t = useApp((s) => s.t);
  if (player && t) return cached(initialsCache, t, (x) => initialsMap(x.players)).get(player.id) ?? initialsForNew([], player.name);
  return initialsForNew(t?.players ?? [], name ?? player?.name ?? '');
}

export function Avatar({ player, name, color, size = 40, className = '', marks }: Props) {
  const t = useT();
  const tour = useApp((s) => s.t);
  const initials = useInitials(player, name);
  const c = color ?? player?.color ?? '#E60012';
  const showMarks = (marks ?? size >= 28) && !!player && !!tour;
  const earned = showMarks ? (cached(marksCache, tour!, playerMarks).get(player!.id) ?? []) : [];
  const m = Math.max(14, Math.round(size * 0.38));
  return (
    <span
      className={`avatar ${className}`}
      style={{ width: size, height: size, ['--c' as string]: c, background: c, color: badgeTextColor(c), fontSize: size * (initials.length > 1 ? 0.4 : 0.48), borderWidth: Math.max(2, Math.round(size / 20)) }}
      aria-hidden="true"
      data-initials={initials}
    >
      <span className="avatar-initials">{initials || '?'}</span>
      {earned.includes('crown') && (
        <span className="avatar-mark mark-crown" title={t('mark.crown')}>
          <Crown size={m} />
        </span>
      )}
      {earned.includes('flames') && (
        <span className="avatar-mark mark-flames" title={t('mark.flames')}>
          <Flame size={m} />
        </span>
      )}
      {earned.includes('clover') && (
        <span className="avatar-mark mark-clover" title={t('ko.lucky')}>
          <Clover size={m} />
        </span>
      )}
    </span>
  );
}
