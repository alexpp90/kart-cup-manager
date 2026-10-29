import { useId, useState } from 'react';
import type { StandingRow, Tiebreak } from '../engine/ranking';
import type { Tournament } from '../engine/types';
import { useT } from '../store/store';
import { IconInfo } from './Icons';

export function tieLines(t: ReturnType<typeof useT>, tour: Tournament, row: StandingRow): string[] {
  const name = (id: string) => tour.players.find((p) => p.id === id)?.name ?? '?';
  const line = (tb: Tiebreak) => {
    const head = t('tie.above', { name: name(tb.other) });
    const detail =
      tb.kind === 'wins' ? t('tie.wins', { mine: tb.mine, theirs: tb.theirs })
      : tb.kind === 'best' ? t('tie.best', { mine: tb.mine, theirs: tb.theirs })
      : tb.kind === 'h2h' ? t('tie.h2h', { mine: tb.mine, theirs: tb.theirs })
      : tb.kind === 'sudden' ? t('tie.sudden')
      : t('tie.unresolved');
    return `${head} ${detail}`;
  };
  return [row.tieAbove, row.tieBelow].filter((x): x is Tiebreak => !!x).map(line);
}

/** Small ⓘ button with a tooltip that explains how a tie was broken (hover or keyboard focus). */
export function TieInfo({ tour, row }: { tour: Tournament; row: StandingRow }) {
  const t = useT();
  const id = useId();
  const [open, setOpen] = useState(false);
  const lines = tieLines(t, tour, row);
  if (!lines.length) return null;
  return (
    <span className="tie-info" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="tie-btn" aria-label={t('standings.tieInfo')} aria-describedby={id} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} title={lines.join('\n')}>
        <IconInfo size={16} />
      </button>
      <span role="tooltip" id={id} className={`tooltip ${open ? 'open' : ''}`}>
        {lines.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </span>
    </span>
  );
}
