// Time during the event: how long heats really take, and how long is left.
// Pure functions of the tournament and a clock value, so they unit test with
// fixed timestamps.
import { nextFieldSize, planKnockout } from './knockout';
import { advanceFor, makePlan, minutesPerHeat } from './plan';
import { allHeats, currentRound, isPlayed, roundComplete, roundOutcome, roundCandidates, upcoming } from './tournament';
import { heatCountOf } from './finals';
import type { Tournament } from './types';

/** A gap this many times the estimate counts as a break and is not measured. */
export const BREAK_FACTOR = 2.5;
/** The guess counts like this many measured heats, so one slow heat doesn't swing the estimate. */
export const GUESS_WEIGHT = 2;

/**
 * Measured heat durations in minutes: the time between consecutive first saves.
 * The first heat is measured from when its round was generated (it became
 * "Now racing"). Gaps longer than BREAK_FACTOR × the estimate are breaks.
 */
export function measuredHeatMinutes(t: Tournament): number[] {
  const guess = minutesPerHeat(t.settings);
  const times = allHeats(t)
    .filter(isPlayed)
    .map((h) => h.finishedAt ?? h.savedAt ?? 0)
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  if (!times.length) return [];
  const start = t.rounds[0]?.createdAt ?? 0;
  const out: number[] = [];
  let prev = start > 0 && start <= times[0] ? start : null;
  for (const at of times) {
    if (prev !== null) {
      const m = (at - prev) / 60000;
      if (m > 0 && m <= guess * BREAK_FACTOR) out.push(m);
    }
    prev = at;
  }
  return out;
}

/** (GUESS_WEIGHT × guess + Σ measured) / (GUESS_WEIGHT + measured heats). */
export function correctedMinutesPerHeat(t: Tournament): { perHeat: number; measured: number } {
  const guess = minutesPerHeat(t.settings);
  const m = measuredHeatMinutes(t);
  const sum = m.reduce((a, b) => a + b, 0);
  return { perHeat: (GUESS_WEIGHT * guess + sum) / (GUESS_WEIGHT + m.length), measured: m.length };
}

/** Heats still to race, from the current state and the plan for the rest. */
export function heatsLeft(t: Tournament): number {
  const s = t.settings;
  const queued = upcoming(t).length;
  const candidates = roundCandidates(t).length;
  if (!t.rounds.length) return makePlan(candidates, s).heats;
  const r = currentRound(t)!;
  if (s.format === 'league') return queued + Math.max(0, s.leagueCups - t.rounds.length);
  if (s.format === 'knockout') {
    if (r.final) return queued;
    const o = roundOutcome(t, r);
    if (o.status === 'done') return queued + planKnockout(o.advancing.length, s.heatSize, s.advance.slice(r.index + 1), s.fill).reduce((a, x) => a + x.sizes.length + (x.lastChance ? 1 : 0), 0);
    // Round still running: its expected next field, plus a Last Chance heat that isn't created yet.
    const sizes = r.heats.map((h) => h.playerIds.length);
    const field = sizes.reduce((a, b) => a + b, 0) + r.byes.length;
    const x = Math.max(1, Math.min(r.advance ?? advanceFor(s, r.index), Math.min(...sizes) - 1));
    const fill = r.fill ?? s.fill;
    const { advancers, target } = nextFieldSize(field, sizes, r.byes.length, x, fill, s.heatSize);
    const pool = Math.min(s.heatSize, field - advancers);
    const lcPending = fill === 'last-chance' && !r.lastChance && target > advancers && pool > target - advancers ? 1 : 0;
    const rest = planKnockout(target, s.heatSize, s.advance.slice(r.index + 1), s.fill).reduce((a, x2) => a + x2.sizes.length + (x2.lastChance ? 1 : 0), 0);
    return queued + lcPending + rest;
  }
  // Classic.
  if (t.finals) return queued + t.finals.stages.filter((st) => !st.heats.length).reduce((a, st) => a + heatCountOf(st.config) + (st.config.wildcards > 0 && !st.lastChance ? 1 : 0), 0);
  const plan = makePlan(candidates, s);
  const perRound = plan.columns[0]?.sizes.length ?? 0;
  const finals = plan.columns.slice(1).reduce((a, c) => a + c.sizes.length + (c.lastChance ? 1 : 0), 0);
  const roundsLeft = Math.max(0, s.qualRounds - t.rounds.length);
  return queued + roundsLeft * perRound + finals;
}

export interface Remaining {
  perHeat: number;
  /** Heats measured so far (0 = the estimate is still the guess). */
  measured: number;
  heatsLeft: number;
  minutesLeft: number;
  /** Wall-clock end, ms since epoch. */
  endsAt: number;
}

export function estimateRemaining(t: Tournament, now: number): Remaining {
  const { perHeat, measured } = correctedMinutesPerHeat(t);
  const left = heatsLeft(t);
  const minutesLeft = left * perHeat;
  return { perHeat, measured, heatsLeft: left, minutesLeft, endsAt: now + minutesLeft * 60000 };
}

/** Knockout: which round is running and how many rounds the plan has in total. */
export function knockoutProgress(t: Tournament): { round: number; rounds: number } {
  const s = t.settings;
  const r = currentRound(t);
  if (!r) return { round: 0, rounds: planKnockout(roundCandidates(t).length, s.heatSize, s.advance, s.fill).length };
  if (r.final) return { round: r.index + 1, rounds: r.index + 1 };
  const o = roundComplete(r) ? roundOutcome(t, r) : null;
  if (o && o.status === 'done') return { round: r.index + 1, rounds: r.index + 1 + planKnockout(o.advancing.length, s.heatSize, s.advance.slice(r.index + 1), s.fill).length };
  const field = r.heats.reduce((a, h) => a + h.playerIds.length, 0) + r.byes.length;
  return { round: r.index + 1, rounds: r.index + planKnockout(field, s.heatSize, s.advance.slice(r.index), s.fill).length };
}
