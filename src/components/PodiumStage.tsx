import type { FinalRow } from '../engine/finals';
import type { Tournament } from '../engine/types';
import { useT } from '../store/store';
import { Avatar } from './Avatar';
import { Star } from './Icons';

/** 2nd · 1st · 3rd blocks with avatars. */
export function PodiumStage({ tour, rows, big }: { tour: Tournament; rows: FinalRow[]; big?: boolean }) {
  const t = useT();
  const byId = new Map(tour.players.map((p) => [p.id, p]));
  const order = [rows[1], rows[0], rows[2]];
  return (
    <div className={`podium ${big ? 'podium-big' : ''}`}>
      {order.map((r, i) => {
        if (!r) return <div key={i} className="podium-slot" />;
        const p = byId.get(r.playerId)!;
        const place = r.place;
        return (
          <div key={r.playerId} className={`podium-slot podium-${place}`} style={{ animationDelay: `${[400, 900, 0][i]}ms` }}>
            {place === 1 && <Star size={big ? 84 : 56} className="podium-star" />}
            <Avatar player={p} size={big ? (place === 1 ? 180 : 140) : place === 1 ? 120 : 92} className="podium-avatar" />
            <div className="podium-name">{p.name}</div>
            {place === 1 && <div className="podium-title">{t('podium.winner')}</div>}
            <div className="podium-block">
              <span>{place}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
