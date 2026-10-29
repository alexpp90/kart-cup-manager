import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Card, PosBadge } from '../components/Bits';
import { HeatCup } from '../components/Cup';
import { IconDown, IconUp } from '../components/Icons';
import { TapOrder } from '../components/TapOrder';
import { orderFromTotals, perRaceTotals, totalsTieGroups, validateResult, type ValidationError } from '../engine/points';
import { clearHeatResult, heatInfo, saveHeatResult, tableFor } from '../engine/tournament';
import type { EntryMode, HeatResult, Player } from '../engine/types';
import { heatTitle, names } from '../lib/labels';
import { go } from '../lib/router';
import { sound } from '../lib/sound';
import { newId, tNow, useApp, useT } from '../store/store';
import { confirmDialog, toast } from '../store/ui';

interface Draft {
  mode: EntryMode;
  races: string[][];
  points: Record<string, string>;
  order: string[];
}

const draftKey = (id: string) => `kart-cup-manager:draft:${id}`;

function loadDraft(heatId: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(heatId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export function ResultEntry({ heatId }: { heatId: string }) {
  const t = useT();
  const tour = useApp((s) => s.t)!;
  const apply = useApp((s) => s.apply);
  const info = heatInfo(tour, heatId);
  const heat = info?.heat;
  const races = tour.settings.racesPerHeat;

  const initial = useMemo<Draft>(() => {
    const saved = loadDraft(heatId);
    if (saved) return saved;
    const r = heat?.result;
    if (r?.mode === 'per-race') return { mode: 'per-race', races: r.races.map((x) => x.slice()), points: {}, order: [] };
    if (r?.mode === 'totals') return { mode: 'totals', races: [], points: Object.fromEntries(Object.entries(r.points).map(([k, v]) => [k, String(v)])), order: r.order.slice() };
    return { mode: tour.settings.entryMode, races: [], points: {}, order: [] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heatId]);
  const [draft, setDraftState] = useState<Draft>(initial);
  const [race, setRace] = useState(() => Math.min(initial.races.filter((r) => r.length).length, races - 1));
  const [errors, setErrors] = useState<ValidationError[]>([]);

  // Keep the half-entered heat across reloads.
  const setDraft = (d: Draft) => {
    setDraftState(d);
    setErrors([]);
    try {
      localStorage.setItem(draftKey(heatId), JSON.stringify(d));
    } catch {
      /* ignore */
    }
  };
  useEffect(() => setDraftState(initial), [initial]);

  if (!heat || !info) {
    return (
      <Card>
        <p className="empty">{t('result.notFound')}</p>
      </Card>
    );
  }
  const players = heat.playerIds.map((id) => tour.players.find((p) => p.id === id)!).filter(Boolean);
  const table = tableFor(tour);
  const back = () => go(info.kind === 'qual' ? '' : 'finals');

  const buildResult = (): HeatResult => {
    if (draft.mode === 'per-race') return { mode: 'per-race', races: draft.races.slice(0, races).map((r) => r.slice()) };
    const points = Object.fromEntries(heat.playerIds.map((id) => [id, draft.points[id] === undefined || draft.points[id] === '' ? Number.NaN : Number(draft.points[id])]));
    return { mode: 'totals', points, order: orderFromTotals(points, heat.playerIds, draft.order) };
  };

  const save = () => {
    const result = buildResult();
    const errs = validateResult(result, heat.playerIds, races);
    if (result.mode === 'per-race' && result.races.length < races) {
      setErrors([{ code: 'race-count', expected: races, actual: result.races.length }]);
      sound.error();
      return;
    }
    if (errs.length) {
      setErrors(errs);
      sound.error();
      return;
    }
    apply(tNow('action.saveHeat'), (x) => saveHeatResult(x, heat.id, result, Date.now(), newId));
    localStorage.removeItem(draftKey(heatId));
    sound.success();
    toast(t('result.saved'), 'success');
    back();
  };

  const clearSaved = async () => {
    if (await confirmDialog({ title: t('result.clearSaved'), body: t('result.clearConfirm'), danger: true })) {
      apply(tNow('action.clearHeat'), (x) => clearHeatResult(x, heat.id, newId));
      localStorage.removeItem(draftKey(heatId));
      setDraftState({ mode: tour.settings.entryMode, races: [], points: {}, order: [] });
      setRace(0);
    }
  };

  const switchMode = () => setDraft({ ...draft, mode: draft.mode === 'per-race' ? 'totals' : 'per-race' });

  return (
    <div className="result-entry">
      <div className="page-head">
        <div>
          <h1 className="display page-title">{heatTitle(t, tour, heat.id)}</h1>
          <HeatCup tour={tour} heat={heat} compact />
        </div>
        <div className="btn-row">
          <button className="btn btn-white btn-sm" onClick={switchMode} data-testid="switch-mode">
            {draft.mode === 'per-race' ? t('result.useTotals') : t('result.usePerRace')}
          </button>
          {heat.result && (
            <button className="btn btn-white btn-sm btn-danger-text" onClick={() => void clearSaved()}>
              {t('result.clearSaved')}
            </button>
          )}
        </div>
      </div>
      {draft.mode === 'per-race' ? (
        <PerRace players={players} draft={draft} setDraft={setDraft} race={race} setRace={setRace} races={races} table={table} />
      ) : (
        <Totals players={players} draft={draft} setDraft={setDraft} />
      )}
      {errors.length > 0 && (
        <div className="notice notice-error" role="alert">
          {errors.map((e, i) => (
            <div key={i}>
              {e.code === 'race-count' ? t('result.err.race-count', { expected: e.expected }) : t(`result.err.${e.code}`, { names: names(tour, e.playerIds) })}
              {'race' in e && e.race ? ` (${t('result.race', { n: e.race })})` : ''}
            </div>
          ))}
        </div>
      )}
      <div className="save-bar">
        <button className="btn btn-white" onClick={back}>
          {t('common.cancel')}
        </button>
        <button className="btn btn-green btn-lg" onClick={save} data-testid="save-heat">
          {t('result.save')}
        </button>
      </div>
    </div>
  );
}

function PerRace({ players, draft, setDraft, race, setRace, races, table }: { players: Player[]; draft: Draft; setDraft: (d: Draft) => void; race: number; setRace: (n: number) => void; races: number; table: number[] }) {
  const t = useT();
  const ids = players.map((p) => p.id);
  const current = draft.races[race] ?? [];
  const totals = perRaceTotals(draft.races.filter((r) => r.length === ids.length), ids, table);
  const setRaceOrder = (order: string[]) => {
    const next = draft.races.slice();
    while (next.length <= race) next.push([]);
    next[race] = order;
    setDraft({ ...draft, races: next });
  };
  const complete = (r: number) => (draft.races[r]?.length ?? 0) === ids.length;
  // Auto-advance only if the organizer is still looking at the race that was just completed.
  const raceRef = useRef(race);
  raceRef.current = race;
  const ranked = players.slice().sort((a, b) => totals[b.id] - totals[a.id]);

  return (
    <div className="per-race">
      <div className="race-tabs" role="tablist">
        {Array.from({ length: races }, (_, i) => (
          <button key={i} role="tab" aria-selected={i === race} className={`tab ${i === race ? 'on' : ''} ${complete(i) ? 'tab-done' : ''}`} onClick={() => setRace(i)} data-testid={`race-tab-${i + 1}`}>
            {t('result.race', { n: i + 1 })} {complete(i) ? '✓' : ''}
          </button>
        ))}
      </div>
      <div className="per-race-grid">
        <Card title={t('result.race', { n: race + 1 })} tone="blue">
          <p className="muted">
            {t('result.tapHint')} <span className="kbd-hint">{t('result.keyHint', { n: Math.min(9, players.length) })}</span>
          </p>
          <TapOrder
            players={players}
            order={current}
            onChange={setRaceOrder}
            onComplete={() => {
              const done = race;
              if (done < races - 1) setTimeout(() => raceRef.current === done && setRace(done + 1), 550);
            }}
          />
          <div className="btn-row">
            <button className="btn btn-white btn-sm" disabled={!current.length} onClick={() => setRaceOrder(current.length === ids.length ? current.slice(0, -2) : current.slice(0, -1))}>
              {t('result.undoTap')}
            </button>
            <button className="btn btn-white btn-sm" disabled={!current.length} onClick={() => setRaceOrder([])}>
              {t('result.clearRace')}
            </button>
            {complete(race) && race < races - 1 && (
              <button className="btn btn-sky btn-sm" onClick={() => setRace(race + 1)}>
                {t('result.nextRace')} →
              </button>
            )}
          </div>
        </Card>
        <Card title={t('result.running')} tone="gold" className="running">
          <table className="mini-table">
            <thead>
              <tr>
                <th></th>
                <th>{t('standings.racer')}</th>
                {Array.from({ length: races }, (_, i) => (
                  <th key={i} className="num">
                    R{i + 1}
                  </th>
                ))}
                <th className="num">{t('result.total')}</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((p, i) => (
                <tr key={p.id}>
                  <td>
                    <PosBadge pos={i + 1} size="sm" />
                  </td>
                  <td>
                    <div className="name-cell">
                      <Avatar player={p} size={24} /> {p.name}
                    </div>
                  </td>
                  {Array.from({ length: races }, (_, r) => {
                    const place = complete(r) ? draft.races[r].indexOf(p.id) + 1 : 0;
                    return (
                      <td key={r} className="num">
                        {place ? table[place - 1] ?? 0 : '·'}
                      </td>
                    );
                  })}
                  <td className="num total">{totals[p.id]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

function Totals({ players, draft, setDraft }: { players: Player[]; draft: Draft; setDraft: (d: Draft) => void }) {
  const t = useT();
  const ids = players.map((p) => p.id);
  const nums = Object.fromEntries(ids.map((id) => [id, draft.points[id] === undefined || draft.points[id] === '' ? Number.NaN : Number(draft.points[id])]));
  const order = orderFromTotals(nums, ids, draft.order);
  const ties = totalsTieGroups(nums, ids);
  const inTie = new Set(ties.flat());
  const byId = new Map(players.map((p) => [p.id, p]));
  const swap = (i: number, j: number) => {
    const o = order.slice();
    [o[i], o[j]] = [o[j], o[i]];
    setDraft({ ...draft, order: o });
  };
  return (
    <div className="per-race-grid">
      <Card title={t('setup.entryTotals')} tone="blue">
        <p className="muted">{t('result.totalsHint')}</p>
        <div className="totals-list">
          {players.map((p, i) => (
            <label key={p.id} className="totals-row">
              <Avatar player={p} size={40} />
              <span className="totals-name">{p.name}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                className="totals-input"
                value={draft.points[p.id] ?? ''}
                autoFocus={i === 0}
                onChange={(e) => setDraft({ ...draft, points: { ...draft.points, [p.id]: e.target.value } })}
                data-testid={`total-${p.name}`}
              />
            </label>
          ))}
        </div>
      </Card>
      <Card title={t('result.order')} tone="gold">
        {ties.length > 0 && <p className="notice notice-warn">{t('result.tieHint')}</p>}
        <ol className="order-list">
          {order.map((id, i) => {
            const p = byId.get(id)!;
            const tieUp = i > 0 && nums[order[i - 1]] === nums[id] && inTie.has(id);
            const tieDown = i < order.length - 1 && nums[order[i + 1]] === nums[id] && inTie.has(id);
            return (
              <li key={id} className={inTie.has(id) ? 'is-tied' : ''}>
                <PosBadge pos={i + 1} size="sm" />
                <Avatar player={p} size={26} />
                <span className="totals-name">{p.name}</span>
                <b className="num">{Number.isNaN(nums[id]) ? '–' : nums[id]}</b>
                {(tieUp || tieDown) && (
                  <span className="tie-arrows">
                    <button className="icon-btn icon-btn-sm" disabled={!tieUp} onClick={() => swap(i, i - 1)} aria-label={`${t('result.placeUp')}: ${p.name}`}>
                      <IconUp size={16} />
                    </button>
                    <button className="icon-btn icon-btn-sm" disabled={!tieDown} onClick={() => swap(i, i + 1)} aria-label={`${t('result.placeDown')}: ${p.name}`}>
                      <IconDown size={16} />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
