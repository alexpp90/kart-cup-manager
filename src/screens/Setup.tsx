import { useState } from 'react';
import { Card, ChoiceCards, Stepper, Toggle } from '../components/Bits';
import { describeStages } from '../components/StageSummary';
import { DEFAULT_POINTS_4, DEFAULT_POINTS_8 } from '../engine/points';
import { minHeatsForFinals } from '../engine/ranking';
import { estimateDuration } from '../engine/schedule';
import { createTournament, defaultSettings } from '../engine/tournament';
import { presetStages } from '../engine/finals';
import type { Settings, TrackMode } from '../engine/types';
import { formatDuration } from '../lib/labels';
import { go } from '../lib/router';
import { sound } from '../lib/sound';
import { newId, tNow, useApp, useT } from '../store/store';

const STEPS = ['basics', 'format', 'points', 'finals', 'tracks'] as const;

export function Setup() {
  const t = useT();
  const replace = useApp((s) => s.replace);
  const [s, setS] = useState<Settings>(defaultSettings);
  const [step, setStep] = useState(0);
  const patch = (p: Partial<Settings>) => setS((x) => ({ ...x, ...p }));
  const create = () => {
    replace(tNow('action.create'), createTournament({ ...s, name: s.name.trim() || 'Kart Cup' }, newId(), Date.now()));
    sound.fanfare();
    go('players');
  };
  const current = STEPS[step];

  return (
    <div className="setup">
      <div className="setup-main">
        <h1 className="display page-title">{t('setup.title')}</h1>
        <ol className="wizard-steps">
          {STEPS.map((k, i) => (
            <li key={k}>
              <button className={`wizard-step ${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`} onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}>
                <span className="wizard-num">{i + 1}</span>
                {t(`setup.step.${k}`)}
              </button>
            </li>
          ))}
        </ol>
        <Card title={t(`setup.step.${current}`)} key={current} className="card-pop">
          {current === 'basics' && (
            <div className="form-grid">
              <label className="field field-wide">
                <span>{t('setup.name')}</span>
                <input value={s.name} onChange={(e) => patch({ name: e.target.value })} data-testid="setup-name" />
              </label>
              <label className="field">
                <span>{t('setup.date')}</span>
                <input type="date" value={s.date} onChange={(e) => patch({ date: e.target.value })} />
              </label>
              <div className="field">
                <span>{t('setup.expected')}</span>
                <div className="range-row">
                  <input type="range" min={4} max={64} value={s.expectedPlayers} onChange={(e) => patch({ expectedPlayers: Number(e.target.value) })} aria-label={t('setup.expected')} />
                  <output className="range-out">{s.expectedPlayers}</output>
                </div>
                <small>{t('setup.expectedHint')}</small>
              </div>
            </div>
          )}
          {current === 'format' && (
            <div className="form-stack">
              <div className="field">
                <span>{t('setup.maxPerHeat')}</span>
                <ChoiceCards
                  name="max"
                  value={s.maxPerHeat}
                  onChange={(v) => patch({ maxPerHeat: v })}
                  options={[
                    { value: 8, label: t('setup.max8'), hint: t('setup.max8Hint'), icon: <b className="big-num">8</b> },
                    { value: 4, label: t('setup.max4'), hint: t('setup.max4Hint'), icon: <b className="big-num">4</b> },
                  ]}
                />
              </div>
              <div className="form-grid">
                <div className="field">
                  <span>{t('setup.races')}</span>
                  <Stepper value={s.racesPerHeat} min={1} max={12} onChange={(v) => patch({ racesPerHeat: v })} label={t('setup.races')} />
                  <small>{t('setup.racesHint')}</small>
                </div>
                <div className="field">
                  <span>{t('setup.rounds')}</span>
                  <Stepper value={s.qualRounds} min={1} max={10} onChange={(v) => patch({ qualRounds: v })} label={t('setup.rounds')} />
                  <small>{t('setup.roundsHint', { n: minHeatsForFinals(s.qualRounds) })}</small>
                </div>
              </div>
              <div className="field">
                <span>{t('setup.entryMode')}</span>
                <ChoiceCards
                  name="entry"
                  value={s.entryMode}
                  onChange={(v) => patch({ entryMode: v })}
                  options={[
                    { value: 'per-race', label: t('setup.entryPerRace'), hint: t('setup.entryPerRaceHint'), icon: '👆' },
                    { value: 'totals', label: t('setup.entryTotals'), hint: t('setup.entryTotalsHint'), icon: '🔢' },
                  ]}
                />
              </div>
            </div>
          )}
          {current === 'points' && <PointsEditor s={s} patch={patch} />}
          {current === 'finals' && (
            <div className="form-stack">
              <div className="field">
                <span>{t('setup.finalsFormat')}</span>
                <p className="muted">{t('setup.finalsAutoHint')}</p>
                <div className="stage-preview">
                  <strong>{t('setup.finalsPreview', { n: s.expectedPlayers })}</strong>
                  <ul>
                    {describeStages(t, presetStages(s.maxPerHeat, s.expectedPlayers, s.lastChance, s.lastChanceWildcards) ?? []).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <Toggle checked={s.lastChance} onChange={(v) => patch({ lastChance: v })} label={t('setup.lastChance')} hint={t('setup.lastChanceHint')} />
              {s.lastChance && (
                <div className="field">
                  <span>{t('setup.wildcards')}</span>
                  <ChoiceCards name="wc" value={s.lastChanceWildcards} onChange={(v) => patch({ lastChanceWildcards: v })} options={[{ value: 1, label: '1' }, { value: 2, label: '2' }]} />
                </div>
              )}
            </div>
          )}
          {current === 'tracks' && (
            <div className="form-stack">
              <ChoiceCards<TrackMode>
                name="track"
                value={s.trackMode}
                onChange={(v) => patch({ trackMode: v })}
                options={(['none', 'random-cup', 'random-tracks', 'pick'] as const).map((m) => ({
                  value: m,
                  label: t(`setup.track.${m}`),
                  hint: t(`setup.track.${m}Hint`),
                  icon: { none: '🎮', 'random-cup': '🎰', 'random-tracks': '🔀', pick: '👉' }[m],
                }))}
              />
              <Toggle checked={s.boosterPass} onChange={(v) => patch({ boosterPass: v })} label={t('setup.booster')} />
            </div>
          )}
          <div className="wizard-nav">
            <button className="btn btn-white" disabled={step === 0} onClick={() => setStep(step - 1)}>
              {t('common.back')}
            </button>
            {step < STEPS.length - 1 ? (
              <button className="btn btn-sky" onClick={() => setStep(step + 1)} data-testid="wizard-next">
                {t('common.next')}
              </button>
            ) : (
              <button className="btn btn-red btn-lg" onClick={create} data-testid="create-tournament">
                {t('setup.create')}
              </button>
            )}
          </div>
        </Card>
      </div>
      <aside className="setup-side">
        <EstimateCard s={s} patch={patch} players={s.expectedPlayers} />
        <button className="btn btn-red btn-lg btn-block" onClick={create}>
          {t('setup.create')}
        </button>
      </aside>
    </div>
  );
}

export function EstimateCard({ s, patch, players }: { s: Settings; patch: (p: Partial<Settings>) => void; players: number }) {
  const t = useT();
  const e = estimateDuration(players, s);
  return (
    <Card title={t('setup.estimate')} tone="gold" className="estimate">
      <div className="estimate-big" aria-live="polite">
        {formatDuration(t, e.totalMinutes)}
      </div>
      <div className="muted">{t('setup.estimateFor', { n: players })}</div>
      <dl className="estimate-list">
        <dt>{t('setup.qualHeats')}</dt>
        <dd>{e.qualHeats}</dd>
        <dt>{t('setup.finalsHeats')}</dt>
        <dd>{e.finalsHeats}</dd>
        <dt>{t('setup.perHeat')}</dt>
        <dd>{formatDuration(t, e.minutesPerHeat)}</dd>
      </dl>
      <div className="form-grid form-grid-tight">
        <div className="field">
          <span>{t('setup.minutesPerRace')}</span>
          <Stepper value={s.minutesPerRace} min={0.5} max={10} step={0.5} onChange={(v) => patch({ minutesPerRace: v })} label={t('setup.minutesPerRace')} />
        </div>
        <div className="field">
          <span>{t('setup.changeover')}</span>
          <Stepper value={s.changeoverMinutes} min={0} max={15} step={0.5} onChange={(v) => patch({ changeoverMinutes: v })} label={t('setup.changeover')} />
        </div>
      </div>
    </Card>
  );
}

export function PointsEditor({ s, patch }: { s: Settings; patch: (p: Partial<Settings>) => void }) {
  const t = useT();
  const tables: { key: 'points8' | 'points4'; n: number; def: number[] }[] = [
    { key: 'points8', n: 8, def: DEFAULT_POINTS_8 },
    { key: 'points4', n: 4, def: DEFAULT_POINTS_4 },
  ];
  const ordered = s.maxPerHeat === 8 ? tables : tables.slice().reverse();
  return (
    <div className="form-stack">
      <p className="muted">{t('setup.pointsHint')}</p>
      {ordered.map((tb) => (
        <fieldset key={tb.key} className={`points-table ${s.maxPerHeat === tb.n ? 'is-active' : ''}`}>
          <legend>{t('setup.pointsFor', { n: tb.n })}</legend>
          <div className="points-row">
            {s[tb.key].map((v, i) => (
              <label key={i} className="points-cell">
                <span>{t('setup.place', { n: i + 1 })}</span>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={v}
                  onChange={(e) => {
                    const next = s[tb.key].slice();
                    next[i] = Math.max(0, Math.round(Number(e.target.value) || 0));
                    patch({ [tb.key]: next } as Partial<Settings>);
                  }}
                />
              </label>
            ))}
          </div>
          <button type="button" className="btn btn-sm btn-white" onClick={() => patch({ [tb.key]: tb.def.slice() } as Partial<Settings>)}>
            {t('setup.resetPoints')}
          </button>
        </fieldset>
      ))}
    </div>
  );
}
