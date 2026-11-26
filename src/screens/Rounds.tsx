import { useState } from 'react';
import { HeatCard } from '../components/HeatCard';
import { IconPlus } from '../components/Icons';
import { RoundPreview } from '../components/RoundPreview';
import { SuddenDeathCard } from '../components/SuddenDeath';
import { canGenerateRound, luckyLosers, roundComplete, roundOutcome } from '../engine/tournament';
import { names, nextRoundLabel, roundLabel } from '../lib/labels';
import { go } from '../lib/router';
import { useApp, useT } from '../store/store';
import { confirmDialog } from '../store/ui';

export function Rounds({ roundIndex }: { roundIndex?: number }) {
  const t = useT();
  const tour = useApp((s) => s.t)!;
  const dispatch = useApp((s) => s.dispatch);
  const [preview, setPreview] = useState(false);
  const idx = roundIndex !== undefined && tour.rounds[roundIndex] ? roundIndex : tour.rounds.length - 1;
  const round = tour.rounds[idx];
  const blocked = canGenerateRound(tour);
  const format = tour.settings.format;
  const canAddRound = format !== 'knockout' && !tour.finals && blocked?.ok === false && blocked.error === 'all-rounds-played';
  const lucky = luckyLosers(tour);
  const outcome = round && format === 'knockout' ? roundOutcome(tour, round) : null;

  const addRound = async () => {
    const n = (format === 'league' ? tour.settings.leagueCups : tour.settings.qualRounds) + 1;
    const body = format === 'league' ? t('rounds.addCupConfirm', { n }) : t('rounds.addRoundConfirm', { n });
    if (await confirmDialog({ title: format === 'league' ? t('rounds.addCup') : t('rounds.addRound'), body })) {
      dispatch({ type: 'addRound' });
    }
  };

  return (
    <div className="rounds">
      <div className="page-head">
        <h1 className="display page-title">{t('rounds.title')}</h1>
        <div className="btn-row">
          {!blocked && (
            <button className="btn btn-red" onClick={() => setPreview(true)} data-testid="generate-round">
              {nextRoundLabel(t, tour)}
            </button>
          )}
          {canAddRound && (
            <button className="btn btn-white" onClick={() => void addRound()}>
              <IconPlus /> {format === 'league' ? t('rounds.addCup') : t('rounds.addRound')}
            </button>
          )}
        </div>
      </div>
      {tour.rounds.length > 0 && (
        <div className="tabs" role="tablist">
          {tour.rounds.map((r) => (
            <button key={r.id} role="tab" aria-selected={r.index === idx} className={`tab ${r.index === idx ? 'on' : ''}`} onClick={() => go(`rounds/${r.index}`)}>
              {roundLabel(t, tour, r.index)} {roundComplete(r) ? '✓' : `· ${r.heats.filter((h) => h.result).length}/${r.heats.length}`}
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
          <p className="muted">{t('rounds.progress', { done: round.heats.filter((h) => h.result).length, total: round.heats.length })}{format === 'knockout' && !round.final && <> · {t('ko.advanceChip', { x: round.advance ?? 1 })} · {t(`fill.${round.fill ?? tour.settings.fill}`)}</>}</p>
          {round.byes.length > 0 && <p className="notice">{t(tour.settings.format === 'knockout' ? 'ko.byes' : 'heat.byes', { names: names(tour, round.byes) })}</p>}
          {outcome?.status === 'tie' && idx === tour.rounds.length - 1 && <SuddenDeathCard tie={outcome.tie} body={t('ko.tieBody', { names: names(tour, outcome.tie) })} />}
          {outcome?.status === 'done' && !outcome.final && (
            <p className="notice notice-ok" data-testid="round-outcome">
              {t('ko.outcome', { n: outcome.advancing.length })}
              {outcome.luckyLosers.length > 0 && <> · {t('ko.outcomeLucky', { names: names(tour, outcome.luckyLosers) })}</>}
            </p>
          )}
          <div className="heat-grid">
            {round.heats.map((h, i) => (
              <HeatCard key={h.id} tour={tour} heat={h} siblings={round.heats} index={i} advance={format === 'knockout' && !round.final ? round.advance : undefined} lucky={lucky} />
            ))}
            {round.lastChance && <HeatCard tour={tour} heat={round.lastChance} index={round.heats.length} advance={outcome?.status === 'done' ? outcome.luckyLosers.length : undefined} lucky={lucky} />}
          </div>
        </>
      )}
      {preview && <RoundPreview onClose={() => setPreview(false)} />}
    </div>
  );
}
