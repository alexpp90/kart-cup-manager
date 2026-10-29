import { useState } from 'react';
import { HeatCard } from '../components/HeatCard';
import { IconPlus } from '../components/Icons';
import { RoundPreview } from '../components/RoundPreview';
import { canGenerateRound, roundComplete, setQualRounds } from '../engine/tournament';
import { names } from '../lib/labels';
import { go } from '../lib/router';
import { tNow, useApp, useT } from '../store/store';
import { confirmDialog } from '../store/ui';

export function Rounds({ roundIndex }: { roundIndex?: number }) {
  const t = useT();
  const tour = useApp((s) => s.t)!;
  const apply = useApp((s) => s.apply);
  const [preview, setPreview] = useState(false);
  const idx = roundIndex !== undefined && tour.rounds[roundIndex] ? roundIndex : tour.rounds.length - 1;
  const round = tour.rounds[idx];
  const blocked = canGenerateRound(tour);
  const canAddRound = !tour.finals && blocked?.ok === false && blocked.error === 'all-rounds-played';

  const addRound = async () => {
    const n = tour.settings.qualRounds + 1;
    if (await confirmDialog({ title: t('rounds.addRound'), body: t('rounds.addRoundConfirm', { n }) })) {
      apply(tNow('action.extraRound'), (x) => setQualRounds(x, n));
    }
  };

  return (
    <div className="rounds">
      <div className="page-head">
        <h1 className="display page-title">{t('rounds.title')}</h1>
        <div className="btn-row">
          {!blocked && (
            <button className="btn btn-red" onClick={() => setPreview(true)} data-testid="generate-round">
              {tour.rounds.length ? t('home.generateNext', { n: tour.rounds.length + 1 }) : t('home.generateFirst')}
            </button>
          )}
          {canAddRound && (
            <button className="btn btn-white" onClick={() => void addRound()}>
              <IconPlus /> {t('rounds.addRound')}
            </button>
          )}
        </div>
      </div>
      {tour.rounds.length > 0 && (
        <div className="tabs" role="tablist">
          {tour.rounds.map((r) => (
            <button key={r.id} role="tab" aria-selected={r.index === idx} className={`tab ${r.index === idx ? 'on' : ''}`} onClick={() => go(`rounds/${r.index}`)}>
              {t('phase.roundLong', { n: r.index + 1 })} {roundComplete(r) ? '✓' : `· ${r.heats.filter((h) => h.result).length}/${r.heats.length}`}
            </button>
          ))}
        </div>
      )}
      {!round ? (
        <div className="card">
          <p className="empty">{t('rounds.none')}</p>
        </div>
      ) : (
        <>
          <p className="muted">{t('rounds.progress', { done: round.heats.filter((h) => h.result).length, total: round.heats.length })}</p>
          {round.byes.length > 0 && <p className="notice">{t('heat.byes', { names: names(tour, round.byes) })}</p>}
          <div className="heat-grid">
            {round.heats.map((h, i) => (
              <HeatCard key={h.id} tour={tour} heat={h} siblings={round.heats} index={i} />
            ))}
          </div>
        </>
      )}
      {preview && <RoundPreview onClose={() => setPreview(false)} />}
    </div>
  );
}
