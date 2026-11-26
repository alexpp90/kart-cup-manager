import { useState } from 'react';
import { Card, ChoiceCards, Toggle } from '../components/Bits';
import { FormatFields, PlanCard, ScoringFields, TimingFields } from '../components/Planner';
import { suggestFormat } from '../engine/plan';
import { createTournament, defaultSettings } from '../engine/tournament';
import type { Settings, TrackMode } from '../engine/types';
import { go } from '../lib/router';
import { sound } from '../lib/sound';
import { newId, tNow, useApp, useT } from '../store/store';

const STEPS = ['basics', 'format', 'points', 'tracks'] as const;

export function Setup() {
  const t = useT();
  const replace = useApp((s) => s.replace);
  const [s, setS] = useState<Settings>(defaultSettings);
  const [step, setStep] = useState(0);
  // The format follows the suggestion until the organizer picks one.
  const [formatPicked, setFormatPicked] = useState(false);
  const patch = (p: Partial<Settings>) =>
    setS((x) => {
      const next = { ...x, ...p };
      if (!formatPicked && !('format' in p) && ('heatSize' in p || 'expectedPlayers' in p)) next.format = suggestFormat(next.expectedPlayers, next.heatSize);
      return next;
    });
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
            </div>
          )}
          {current === 'format' && (
            <div className="form-stack">
              <div className="field">
                <span>{t('setup.expected')}</span>
                <div className="range-row">
                  <input type="range" min={2} max={64} value={s.expectedPlayers} onChange={(e) => patch({ expectedPlayers: Number(e.target.value) })} aria-label={t('setup.expected')} data-testid="expected-players" />
                  <output className="range-out">{s.expectedPlayers}</output>
                </div>
                <small>{t('setup.expectedHint')}</small>
              </div>
              <FormatFields s={s} patch={patch} players={s.expectedPlayers} onFormatPicked={() => setFormatPicked(true)} />
              <h3 className="sub-title">{t('setup.timing')}</h3>
              <TimingFields s={s} patch={patch} />
            </div>
          )}
          {current === 'points' && <ScoringFields s={s} patch={patch} />}
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
        <PlanCard s={s} players={s.expectedPlayers} onApply={(p) => patch(p)} />
        <button className="btn btn-red btn-lg btn-block" onClick={create}>
          {t('setup.create')}
        </button>
      </aside>
    </div>
  );
}
