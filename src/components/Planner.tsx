// The planner UI: format fields shared by the setup wizard and Settings, and the
// plan card with a diagram per round, a time breakdown, warnings and computed
// cheaper alternatives.
import { Fragment } from 'react';
import { defaultAdvance } from '../engine/knockout';
import { alternatives, endTime, makePlan, suggestFormat, type Alternative, type Plan, type PlanColumn } from '../engine/plan';
import { DEFAULT_POINTS } from '../engine/points';
import type { FillMode, Format, Settings } from '../engine/types';
import type { Key, Params } from '../i18n';
import { formatDuration, stageName } from '../lib/labels';
import { useT } from '../store/store';
import { Card, ChoiceCards, Stepper, Toggle } from './Bits';

type T = (key: Key, params?: Params) => string;
type Patch = (p: Partial<Settings>) => void;

export function columnTitle(t: T, c: PlanColumn): string {
  if (c.kind === 'qual') return t('plan.qual', { n: c.repeat });
  if (c.kind === 'league') return t('plan.league', { n: c.repeat });
  if (c.kind === 'stage') return stageName(t, c.name ?? '');
  if (c.kind === 'final') return c.name ? stageName(t, c.name) : t('stage.final');
  return t('phase.roundLong', { n: c.index + 1 });
}

export function columnCaption(t: T, c: PlanColumn, fill: FillMode): string {
  const parts: string[] = [];
  if (c.kind === 'league') parts.push(t('plan.everyone', { n: c.repeat }));
  else if (c.kind === 'qual') parts.push(t('plan.qualCaption', { n: c.repeat }));
  else if (c.kind === 'final') parts.push(t('plan.finalOf', { n: c.sizes[0] }));
  else {
    if (c.fillUps === 0) parts.push(t('plan.topEach', { x: c.advance }));
    else if (c.kind === 'stage') parts.push(t('plan.topEachWild', { x: c.advance, f: c.fillUps }));
    else if (c.lastChance) parts.push(t('plan.topEachLc', { x: c.advance, f: c.fillUps, size: c.lastChance }));
    else parts.push(t(fill === 'off' ? 'plan.topEach' : 'plan.topEachBest', { x: c.advance, f: c.fillUps }));
  }
  if (c.byes) parts.push(t('plan.byes', { n: c.byes }));
  return parts.join(' · ');
}

/** One column per round: heat boxes with their sizes, arrows with the next field. */
export function PlanDiagram({ plan, fill }: { plan: Plan; fill: FillMode }) {
  const t = useT();
  if (!plan.columns.length) return null;
  return (
    <div className="plan-diagram" data-testid="plan-diagram" role="img" aria-label={plan.columns.map((c) => `${columnTitle(t, c)}: ${t('common.heats', { n: c.sizes.length })}`).join(', ')}>
      {plan.columns.map((c, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <div className="plan-arrow" aria-hidden="true">
              <span>▶</span>
              <small>{plan.columns[i - 1].next || ''}</small>
            </div>
          )}
          <div className={`plan-col plan-col-${c.kind}`}>
            <div className="plan-col-title">{columnTitle(t, c)}</div>
            <div className="plan-heats">
              {c.sizes.map((size, k) => (
                <span key={k} className="plan-heat">
                  {size}
                </span>
              ))}
              {c.lastChance > 0 && (
                <span className="plan-heat plan-heat-lc" title={t('stage.lastChance')}>
                  LC {c.lastChance}
                </span>
              )}
            </div>
            <div className="plan-col-caption">{columnCaption(t, c, fill)}</div>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

export function PlanBreakdown({ plan, start }: { plan: Plan; start: string }) {
  const t = useT();
  const m = plan.minutesPerHeat;
  const ends = endTime(start, plan.minutes);
  return (
    <table className="plan-breakdown" data-testid="plan-breakdown">
      <tbody>
        {plan.columns.map((c, i) => {
          const heats = c.sizes.length * c.repeat;
          return (
            <Fragment key={i}>
              <tr>
                <th scope="row">{columnTitle(t, c)}</th>
                <td>{t('plan.heatsTimes', { h: heats, m: formatDuration(t, m) })}</td>
                <td className="num">{formatDuration(t, heats * m)}</td>
              </tr>
              {c.lastChance > 0 && (
                <tr>
                  <th scope="row">{t('stage.lastChance')}</th>
                  <td>{t('plan.heatsTimes', { h: 1, m: formatDuration(t, m) })}</td>
                  <td className="num">{formatDuration(t, m)}</td>
                </tr>
              )}
            </Fragment>
          );
        })}
        <tr className="plan-total">
          <th scope="row">{t('setup.total')}</th>
          <td>{t('common.heats', { n: plan.heats })}</td>
          <td className="num">
            <b>{formatDuration(t, plan.minutes)}</b>
            {ends && <> · {t('plan.ends', { time: ends })}</>}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function PlanWarnings({ plan, s }: { plan: Plan; s: Pick<Settings, 'availableMinutes' | 'heatSize'> }) {
  const t = useT();
  if (!plan.warnings.length) return null;
  return (
    <div className="notice notice-warn" role="status" data-testid="plan-warning">
      {plan.warnings.map((w) => (
        <div key={w}>
          {w === 'long' && t('plan.warn.long', { d: formatDuration(t, plan.minutes) })}
          {w === 'over-time' && t('plan.warn.over', { d: formatDuration(t, plan.minutes), a: formatDuration(t, s.availableMinutes) })}
          {w === 'too-few' && t('plan.warn.tooFew')}
          {w === 'league-too-many' && t('plan.warn.leagueTooMany', { n: plan.players, s: s.heatSize })}
          {w === 'classic-heat-size' && t('plan.warn.classicSize')}
        </div>
      ))}
    </div>
  );
}

export function altLabel(t: T, a: Alternative): string {
  const c = a.change;
  if (c.kind === 'advance') return t('plan.alt.advance', { v: c.value });
  if (c.kind === 'fill') return t(c.value === 'off' ? 'plan.alt.fillOff' : 'plan.alt.fillBest');
  if (c.kind === 'cups') return t('plan.alt.cups', { n: c.value });
  if (c.kind === 'rounds') return t('plan.alt.rounds', { n: c.value });
  return t('plan.alt.knockout');
}

/** The plan for `players` under `s`: total, diagram, breakdown, warnings, alternatives. */
export function PlanCard({ s, players, onApply, title }: { s: Settings; players: number; onApply?: Patch; title?: string }) {
  const t = useT();
  const plan = makePlan(players, s);
  const alts = plan.warnings.includes('long') || plan.warnings.includes('over-time') ? alternatives(players, s) : [];
  const ends = endTime(s.startTime, plan.minutes);
  return (
    <Card title={title ?? t('plan.title')} tone="gold" className="estimate plan-card">
      <div className="estimate-big" aria-live="polite" data-testid="plan-total">
        {plan.columns.length ? formatDuration(t, plan.minutes) : '–'}
      </div>
      <div className="muted">
        {t('setup.estimateFor', { n: players })} · {t(`format.${plan.format}`)}
        {ends && <> · {t('plan.ends', { time: ends })}</>}
      </div>
      <PlanWarnings plan={plan} s={s} />
      <PlanDiagram plan={plan} fill={s.fill} />
      {plan.columns.length > 0 && <PlanBreakdown plan={plan} start={s.startTime} />}
      {alts.length > 0 && (
        <div className="plan-alts" data-testid="plan-alternatives">
          <strong>{t('plan.alt.title')}</strong>
          <ul>
            {alts.map((a, i) => (
              <li key={i}>
                <span>
                  {altLabel(t, a)} · <b>{t('plan.saves', { d: formatDuration(t, a.saves) })}</b>
                  <small className="muted"> · {formatDuration(t, a.plan.minutes)} · {t('plan.cupsEach', { c: a.plan.cupsPerPlayer.toFixed(1) })}</small>
                </span>
                {onApply && (
                  <button type="button" className="btn btn-sm btn-white" onClick={() => onApply(a.patch)} data-testid={`use-alt-${i}`}>
                    {t('plan.alt.use')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

const HEAT_SIZES = [2, 3, 4, 5, 6, 7, 8];

/** Heat size, format and the format's own options. */
export function FormatFields({ s, patch, players, locked, onFormatPicked }: { s: Settings; patch: Patch; players: number; locked?: boolean; onFormatPicked?: () => void }) {
  const t = useT();
  const suggested = suggestFormat(players, s.heatSize);
  const plan = makePlan(players, s);
  const formats: Format[] = ['league', 'knockout', 'classic'];
  const setAdvance = (i: number, v: number) => {
    const next = s.advance.slice();
    for (let k = next.length; k < i; k++) next[k] = plan.columns[k]?.advance || defaultAdvance(s.heatSize);
    next[i] = v;
    patch({ advance: next });
  };
  return (
    <div className="form-stack">
      <div className="field">
        <span>{t('setup.heatSize')}</span>
        <ChoiceCards
          name="heat-size"
          value={s.heatSize}
          disabled={locked}
          onChange={(v) => patch({ heatSize: v, ...(s.formatAuto || (s.format === 'classic' && v < 3) ? { format: suggestFormat(players, v) } : {}) })}
          options={HEAT_SIZES.map((n) => ({ value: n, label: <b className="big-num">{n}</b> }))}
        />
        <small>{locked ? t('settings.lockedMax') : t('setup.heatSizeHint')}</small>
      </div>
      <div className="field">
        <span>{t('setup.format')}</span>
        <ChoiceCards<Format>
          name="format"
          value={s.format}
          disabled={locked}
          onChange={(v) => {
            onFormatPicked?.();
            patch({ format: v, formatAuto: false });
          }}
          options={formats
            .filter((f) => f !== 'classic' || s.heatSize >= 3)
            .map((f) => ({
              value: f,
              label: (
                <>
                  {t(`format.${f}`)} {f === suggested && <span className="chip chip-ok">{t('setup.suggested')}</span>}
                </>
              ),
              hint: t(`format.${f}Hint`),
              icon: { league: '🏆', knockout: '⚔️', classic: '📊' }[f],
            }))}
        />
      </div>
      {s.format === 'knockout' && (
        <>
          <div className="field">
            <span>{t('setup.advance')}</span>
            <div className="advance-list">
              {plan.columns
                .filter((c) => c.kind === 'ko')
                .map((c) => (
                  <div key={c.index} className="advance-row">
                    <span>{t('phase.roundLong', { n: c.index + 1 })}</span>
                    <Stepper value={c.advance} min={1} max={Math.max(1, Math.min(...c.sizes) - 1)} onChange={(v) => setAdvance(c.index, v)} label={t('setup.advanceRound', { n: c.index + 1 })} />
                  </div>
                ))}
            </div>
            <small>{t('setup.advanceHint')}</small>
          </div>
          <div className="field">
            <span>{t('setup.fill')}</span>
            <ChoiceCards<FillMode>
              name="fill"
              value={s.fill}
              onChange={(v) => patch({ fill: v })}
              options={(['best', 'last-chance', 'off'] as const).map((f) => ({ value: f, label: t(`fill.${f}`), hint: t(`fill.${f}Hint`) }))}
            />
          </div>
        </>
      )}
      {s.format === 'league' && (
        <div className="field">
          <span>{t('setup.leagueCups')}</span>
          <Stepper value={s.leagueCups} min={1} max={10} onChange={(v) => patch({ leagueCups: v })} label={t('setup.leagueCups')} />
        </div>
      )}
      {s.format === 'classic' && (
        <>
          <div className="field">
            <span>{t('setup.rounds')}</span>
            <Stepper value={s.qualRounds} min={1} max={10} onChange={(v) => patch({ qualRounds: v })} label={t('setup.rounds')} />
            <small>{t('setup.roundsHint', { n: Math.ceil(s.qualRounds / 2) })}</small>
          </div>
          <Toggle checked={s.lastChance} onChange={(v) => patch({ lastChance: v })} label={t('setup.lastChance')} hint={t('setup.lastChanceHint')} />
          {s.lastChance && (
            <div className="field">
              <span>{t('setup.wildcards')}</span>
              <ChoiceCards name="wc" value={s.lastChanceWildcards} onChange={(v) => patch({ lastChanceWildcards: v })} options={[{ value: 1, label: '1' }, { value: 2, label: '2' }]} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Minutes per race, cup overhead, changeover, time available, start time. */
export function TimingFields({ s, patch }: { s: Settings; patch: Patch }) {
  const t = useT();
  return (
    <div className="form-grid form-grid-tight">
      <div className="field">
        <span>{t('setup.minutesPerRace')}</span>
        <Stepper value={s.minutesPerRace} min={0.5} max={10} step={0.5} onChange={(v) => patch({ minutesPerRace: v })} label={t('setup.minutesPerRace')} />
      </div>
      <div className="field">
        <span>{t('setup.cupOverhead')}</span>
        <Stepper value={s.cupOverheadMinutes} min={0} max={15} step={0.5} onChange={(v) => patch({ cupOverheadMinutes: v })} label={t('setup.cupOverhead')} />
      </div>
      <div className="field">
        <span>{t('setup.changeover')}</span>
        <Stepper value={s.changeoverMinutes} min={0} max={15} step={0.5} onChange={(v) => patch({ changeoverMinutes: v })} label={t('setup.changeover')} />
      </div>
      <div className="field">
        <span>{t('setup.available')}</span>
        <Stepper value={s.availableMinutes} min={0} max={720} step={15} onChange={(v) => patch({ availableMinutes: v })} label={t('setup.available')} />
        <small>{s.availableMinutes ? formatDuration(t, s.availableMinutes) : t('setup.availableOff')}</small>
      </div>
      <label className="field">
        <span>{t('setup.startTime')}</span>
        <input type="time" value={s.startTime} onChange={(e) => patch({ startTime: e.target.value })} data-testid="start-time" />
      </label>
    </div>
  );
}

/** Entry mode, races per heat and the points table (one row of S places). */
export function ScoringFields({ s, patch }: { s: Settings; patch: Patch }) {
  const t = useT();
  const places = Math.max(2, s.heatSize);
  const table = Array.from({ length: places }, (_, i) => s.points[i] ?? 0);
  return (
    <div className="form-stack">
      <div className="field">
        <span>{t('setup.entryMode')}</span>
        <ChoiceCards
          name="entry"
          value={s.entryMode}
          onChange={(v) => patch({ entryMode: v })}
          options={[
            { value: 'totals', label: t('setup.entryTotals'), hint: t('setup.entryTotalsHint'), icon: '🔢' },
            { value: 'ranking', label: t('setup.entryRanking'), hint: t('setup.entryRankingHint'), icon: '🏁' },
            { value: 'per-race', label: t('setup.entryPerRace'), hint: t('setup.entryPerRaceHint'), icon: '👆' },
          ]}
        />
      </div>
      <fieldset className="points-table is-active">
        <legend>{t('setup.pointsTable')}</legend>
        <p className="muted">{t('setup.pointsHint')}</p>
        <div className="points-row">
          {table.map((v, i) => (
            <label key={i} className="points-cell">
              <span>{t('setup.place', { n: i + 1 })}</span>
              <input
                type="number"
                min={0}
                max={99}
                value={v}
                onChange={(e) => {
                  const next = s.points.slice();
                  while (next.length <= i) next.push(0);
                  next[i] = Math.max(0, Math.round(Number(e.target.value) || 0));
                  patch({ points: next });
                }}
              />
            </label>
          ))}
        </div>
        <button type="button" className="btn btn-sm btn-white" onClick={() => patch({ points: DEFAULT_POINTS.slice() })}>
          {t('setup.resetPoints')}
        </button>
      </fieldset>
    </div>
  );
}
