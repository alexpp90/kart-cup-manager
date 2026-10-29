import { isPlayed, phaseOf } from '../engine/tournament';
import type { Tournament } from '../engine/types';
import { useT } from '../store/store';
import { Flag } from './Icons';

export function PhaseBar({ t: tour }: { t: Tournament }) {
  const t = useT();
  const phase = phaseOf(tour);
  const steps: { key: string; label: string; state: 'done' | 'current' | 'todo'; sub?: string }[] = [];
  steps.push({ key: 'reg', label: t('phase.registration'), state: phase === 'registration' ? 'current' : 'done' });
  const lastDone = tour.rounds.length > 0 && tour.rounds[tour.rounds.length - 1].heats.every(isPlayed);
  for (let i = 0; i < tour.settings.qualRounds; i++) {
    const r = tour.rounds[i];
    // The next round to generate counts as "current" once the previous one is complete.
    const pending = !r && phase === 'qualifying' && lastDone && i === tour.rounds.length;
    steps.push({
      key: `r${i}`,
      label: t('phase.round', { n: i + 1 }),
      state: r ? (r.heats.every(isPlayed) ? 'done' : 'current') : pending ? 'current' : 'todo',
      sub: r ? `${r.heats.filter(isPlayed).length}/${r.heats.length}` : undefined,
    });
  }
  steps.push({ key: 'fin', label: t('phase.finals'), state: phase === 'finals' ? 'current' : phase === 'podium' ? 'done' : 'todo' });
  steps.push({ key: 'pod', label: t('phase.podium'), state: phase === 'podium' ? 'current' : 'todo' });
  return (
    <nav className="phasebar" aria-label={t('phase.label')}>
      <ol>
        {steps.map((s) => (
          <li key={s.key} className={`phase phase-${s.state}`} aria-current={s.state === 'current' ? 'step' : undefined}>
            <span className="phase-dot">{s.state === 'done' ? '✓' : ''}</span>
            <span className="phase-label">{s.label}</span>
            {s.sub && <span className="phase-sub">{s.sub}</span>}
          </li>
        ))}
      </ol>
      <Flag size={26} className="phase-flag" />
    </nav>
  );
}
