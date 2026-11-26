import { useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Card } from '../components/Bits';
import { HeatCard } from '../components/HeatCard';
import { IconPlus, IconX, Trophy } from '../components/Icons';
import { describeStages } from '../components/StageSummary';
import { SuddenDeathCard } from '../components/SuddenDeath';
import { presetStages } from '../engine/finals';
import { minHeatsForFinals } from '../engine/ranking';
import { currentRound, finalResults, finalsHeats, finalsPlan, luckyLosers, phaseOf, roundComplete, roundOutcome } from '../engine/tournament';
import type { StageConfig, Tournament } from '../engine/types';
import type { StageError } from '../engine/finals';
import { roundLabel, stageName } from '../lib/labels';
import { go } from '../lib/router';
import { sound } from '../lib/sound';
import { useApp, useT } from '../store/store';
import { confirmDialog } from '../store/ui';

export function Finals() {
  const tour = useApp((s) => s.t)!;
  if (tour.settings.format === 'knockout') return <KnockoutBracket tour={tour} />;
  return tour.finals ? <Bracket tour={tour} /> : <FinalsSetup tour={tour} />;
}

function autoStages(tour: Tournament): StageConfig[] {
  const s = tour.settings;
  const eligible = finalsPlan(tour).eligible.length;
  return presetStages(s.heatSize, eligible, s.lastChance, s.lastChanceWildcards) ?? [];
}

function FinalsSetup({ tour }: { tour: Tournament }) {
  const t = useT();
  const dispatch = useApp((s) => s.dispatch);
  const [stages, setStages] = useState<StageConfig[]>(() => (tour.settings.finalsFormat === 'custom' && tour.settings.customStages.length ? tour.settings.customStages : autoStages(tour)));
  const plan = useMemo(() => finalsPlan(tour, stages), [tour, stages]);
  const round = currentRound(tour);
  const ready = !!round && roundComplete(round);
  const minHeats = minHeatsForFinals(tour.settings.qualRounds);

  const patchStage = (i: number, p: Partial<StageConfig>) => setStages(stages.map((s, k) => (k === i ? { ...s, ...p } : s)));
  const start = async () => {
    if (!(await confirmDialog({ title: t('finals.start'), body: t('finals.startConfirm') }))) return;
    dispatch({ type: 'startFinals', stages });
    sound.fanfare();
  };
  const errorText = (e: StageError) => {
    const stage = 'stage' in e ? stageName(t, stages[e.stage]?.name ?? '') || t('stage.custom', { n: e.stage + 1 }) : '';
    return t(`finals.err.${e.code}`, { ...(e as unknown as Record<string, number>), stage });
  };

  return (
    <div className="finals-setup">
      <div className="page-head">
        <h1 className="display page-title">{t('finals.setup')}</h1>
      </div>
      {!ready && <p className="notice notice-warn">{t('finals.notReady')}</p>}
      {ready && tour.rounds.length < tour.settings.qualRounds && <p className="notice">{t('finals.roundsMissing', { played: tour.rounds.length, planned: tour.settings.qualRounds })}</p>}
      {plan.eligible.length < 3 ? (
        <Card title={t('finals.stages')} tone="blue">
          <p className="now-title">{t('finals.eligible', { n: plan.eligible.length })}</p>
          <p className="muted">{t('finals.notEligibleYet', { n: minHeats })}</p>
        </Card>
      ) : (
      <div className="finals-setup-grid">
        <Card title={t('finals.stages')} tone="blue">
          <p>
            <strong>{t('finals.eligible', { n: plan.eligible.length })}</strong> <span className="muted">{t('finals.notEligibleYet', { n: minHeats })}</span>
          </p>
          <div className="table-scroll">
            <table className="stage-table">
              <thead>
                <tr>
                  <th>{t('finals.stageName')}</th>
                  <th>{t('finals.field')}</th>
                  <th>{t('finals.heatSize')}</th>
                  <th>{t('finals.advance')}</th>
                  <th>{t('finals.wildcards')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {stages.map((s, i) => (
                  <tr key={i}>
                    <td>
                      <input value={stageName(t, s.name)} onChange={(e) => patchStage(i, { name: e.target.value })} aria-label={t('finals.stageName')} />
                    </td>
                    {(['fieldSize', 'heatSize', 'advancePerHeat', 'wildcards'] as const).map((k) => (
                      <td key={k}>
                        <input type="number" min={0} max={64} value={s[k]} onChange={(e) => patchStage(i, { [k]: Math.max(0, Math.round(Number(e.target.value) || 0)) })} aria-label={t(k === 'fieldSize' ? 'finals.field' : k === 'heatSize' ? 'finals.heatSize' : k === 'advancePerHeat' ? 'finals.advance' : 'finals.wildcards')} />
                      </td>
                    ))}
                    <td>
                      <button className="icon-btn" disabled={stages.length < 2} onClick={() => setStages(stages.filter((_, k) => k !== i))} aria-label={t('finals.removeStage')}>
                        <IconX />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="btn-row">
            <button className="btn btn-sm btn-white" onClick={() => setStages([...stages, { name: t('stage.custom', { n: stages.length + 1 }), fieldSize: 4, heatSize: 4, advancePerHeat: 0, wildcards: 0 }])}>
              <IconPlus size={16} /> {t('finals.addStage')}
            </button>
            <button className="btn btn-sm btn-white" onClick={() => setStages(autoStages(tour))}>
              {t('finals.useAuto')}
            </button>
          </div>
          {plan.errors.length > 0 ? (
            <div className="notice notice-error" role="alert">
              {plan.errors.map((e, i) => (
                <div key={i}>{errorText(e)}</div>
              ))}
            </div>
          ) : (
            <ul className="stage-lines">
              {describeStages(t, stages).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
        </Card>
        <div className="finals-side">
          {plan.tie && !plan.errors.length && <SuddenDeathCard tie={plan.tie} />}
          {!plan.errors.length && stages[0] && (
            <Card title={t('standings.q')} tone="gold">
              <ol className="seed-list">
                {plan.eligible.slice(0, stages[0].fieldSize - stages[0].wildcards).map((r, i) => {
                  const p = tour.players.find((x) => x.id === r.playerId)!;
                  return (
                    <li key={r.playerId}>
                      <span className="seed">{i + 1}</span>
                      <Avatar player={p} size={24} />
                      <span>{p.name}</span>
                    </li>
                  );
                })}
              </ol>
              {stages[0].wildcards > 0 && <p className="muted">{t('stage.describeWild', { n: stages[0].wildcards })}</p>}
            </Card>
          )}
          <button className="btn btn-red btn-xl btn-block" disabled={!ready || plan.errors.length > 0 || !!plan.tie} onClick={() => void start()} data-testid="start-finals">
            {t('finals.start')}
          </button>
        </div>
      </div>
      )}
    </div>
  );
}

function Bracket({ tour }: { tour: Tournament }) {
  const t = useT();
  const dispatch = useApp((s) => s.dispatch);
  const finals = tour.finals!;
  const anyPlayed = finalsHeats(tour).some((h) => h.result);
  const results = finalResults(tour);
  const champion = results ? tour.players.find((p) => p.id === results[0].playerId) : null;

  const cancel = async () => {
    if (await confirmDialog({ title: t('finals.cancel'), body: t('finals.cancelConfirm'), danger: true })) dispatch({ type: 'cancelFinals' });
  };

  const columns: { key: string; title: string; content: React.ReactNode; tone: 'red' | 'blue' | 'gold' | 'green' | 'navy' }[] = [];
  finals.stages.forEach((stage, i) => {
    const name = stageName(t, stage.config.name);
    if (stage.lastChance) {
      columns.push({
        key: `lc${i}`,
        title: t('stage.lastChance'),
        tone: 'green',
        content: <HeatCard tour={tour} heat={stage.lastChance} advance={stage.config.wildcards} />,
      });
    }
    const prevName = i > 0 ? stageName(t, finals.stages[i - 1].config.name) : t('stage.lastChance');
    columns.push({
      key: `s${i}`,
      title: name,
      tone: i === finals.stages.length - 1 ? 'gold' : 'blue',
      content: stage.heats.length ? (
        stage.heats.map((h, k) => <HeatCard key={h.id} tour={tour} heat={h} siblings={stage.heats} advance={stage.config.advancePerHeat || (i === finals.stages.length - 1 ? 0 : undefined)} seeds={stage.seeds} index={k} />)
      ) : (
        <div className="bracket-wait">
          {Array.from({ length: stage.config.fieldSize / stage.config.heatSize }, (_, k) => (
            <div key={k} className="bracket-placeholder">
              <span className="muted">{t('finals.waiting', { what: prevName })}</span>
              {Array.from({ length: stage.config.heatSize }, (_, j) => (
                <span key={j} className="slot" />
              ))}
            </div>
          ))}
        </div>
      ),
    });
  });

  return (
    <div className="bracket-page">
      <div className="page-head">
        <h1 className="display page-title">{t('finals.bracket')}</h1>
        <div className="btn-row">
          {phaseOf(tour) === 'podium' && (
            <button className="btn btn-red" onClick={() => go('podium')} data-testid="goto-podium">
              {t('home.toPodium')}
            </button>
          )}
          {!anyPlayed && (
            <button className="btn btn-white btn-danger-text" onClick={() => void cancel()}>
              {t('finals.cancel')}
            </button>
          )}
        </div>
      </div>
      <div className="bracket">
        {columns.map((c, i) => (
          <section key={c.key} className="bracket-col" style={{ animationDelay: `${i * 90}ms` }}>
            <h2 className={`ribbon ribbon-${c.tone}`}>{c.title}</h2>
            <div className="bracket-heats">{c.content}</div>
          </section>
        ))}
        <section className="bracket-col bracket-champ">
          <h2 className="ribbon ribbon-gold">{t('finals.champion')}</h2>
          <div className="champ-box">
            <Trophy size={72} />
            {champion ? (
              <>
                <Avatar player={champion} size={72} />
                <strong className="display">{champion.name}</strong>
              </>
            ) : (
              <span className="muted">{t('finals.tbd')}</span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/** Knockout: one column per round with its heats and Last Chance heat, then the champion. */
function KnockoutBracket({ tour }: { tour: Tournament }) {
  const t = useT();
  const results = finalResults(tour);
  const champion = results ? tour.players.find((p) => p.id === results[0].playerId) : null;
  const lucky = luckyLosers(tour);
  return (
    <div className="bracket-page">
      <div className="page-head">
        <h1 className="display page-title">{t('finals.bracket')}</h1>
        {phaseOf(tour) === 'podium' && (
          <button className="btn btn-red" onClick={() => go('podium')} data-testid="goto-podium">
            {t('home.toPodium')}
          </button>
        )}
      </div>
      {!tour.rounds.length && <p className="notice">{t('rounds.none')}</p>}
      <div className="bracket">
        {tour.rounds.map((r, i) => {
          const o = roundOutcome(tour, r);
          return (
            <section key={r.id} className="bracket-col" style={{ animationDelay: `${i * 90}ms` }}>
              <h2 className={`ribbon ribbon-${r.final ? 'gold' : 'blue'}`}>{roundLabel(t, tour, i)}</h2>
              <div className="bracket-heats">
                {r.heats.map((h, k) => (
                  <HeatCard key={h.id} tour={tour} heat={h} siblings={r.heats} advance={r.final ? 0 : r.advance} index={k} lucky={lucky} controls={false} />
                ))}
                {r.lastChance && <HeatCard tour={tour} heat={r.lastChance} advance={o.status === 'done' ? o.luckyLosers.length : undefined} lucky={lucky} controls={false} />}
              </div>
            </section>
          );
        })}
        <section className="bracket-col bracket-champ">
          <h2 className="ribbon ribbon-gold">{t('finals.champion')}</h2>
          <div className="champ-box">
            <Trophy size={72} />
            {champion ? (
              <>
                <Avatar player={champion} size={72} />
                <strong className="display">{champion.name}</strong>
              </>
            ) : (
              <span className="muted">{t('finals.tbd')}</span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
