// Tournament data model. Everything here is plain JSON-serialisable data so the
// whole tournament can be autosaved, exported, imported and snapshotted for undo.

/** Players per heat = controllers, 2..8. */
export type HeatSize = number;
/** Kept for old call sites: any heat size. */
export type HeatMax = HeatSize;
export const MIN_HEAT = 2;
export const MAX_HEAT = 8;
/**
 * 'classic': qualifying rounds by average, then finals (the v1 format).
 * 'knockout': knockout cups, top X of each heat go on (n > heat size).
 * 'league': everyone races every cup together (n ≤ heat size).
 */
export type Format = 'classic' | 'knockout' | 'league';
/** How a knockout round fills the next round beyond the top X of each heat. */
export type FillMode = 'best' | 'last-chance' | 'off';
/** 'totals': console cup totals · 'ranking': final cup order only · 'per-race': order after every race. */
export type EntryMode = 'totals' | 'ranking' | 'per-race';
export type TrackMode = 'none' | 'random-cup' | 'random-tracks' | 'pick';
export type PlayerStatus = 'registered' | 'checked-in' | 'active' | 'withdrawn';

export interface Settings {
  name: string;
  date: string; // YYYY-MM-DD
  format: Format;
  heatSize: HeatSize;
  racesPerHeat: number;
  /** Classic: number of qualifying rounds. */
  qualRounds: number;
  /** Points per race, index 0 = 1st place. Heats smaller than the table use its top. */
  points: number[];
  entryMode: EntryMode;
  trackMode: TrackMode;
  boosterPass: boolean;
  /** 'auto' picks a preset from the number of eligible players at finals time. */
  finalsFormat: 'auto' | 'custom';
  customStages: StageConfig[];
  lastChance: boolean;
  lastChanceWildcards: 1 | 2;
  /** Knockout: top X per heat for round i (missing entries use the default, half the heat size). */
  advance: number[];
  fill: FillMode;
  /** League: number of cups. */
  leagueCups: number;
  minutesPerRace: number;
  /** Per cup: menus, results screens, track picks. */
  cupOverheadMinutes: number;
  changeoverMinutes: number;
  expectedPlayers: number;
  /** Planner: minutes available for racing (0 = not set). */
  availableMinutes: number;
  /** Planner: start time "HH:MM" ('' = not set). */
  startTime: string;
  kioskAutoCheckIn: boolean;
}

export interface Player {
  id: string;
  name: string;
  tag: string;
  avatar: string; // id from AVATARS
  color: string; // hex
  favorite: string;
  status: PlayerStatus;
  createdAt: number;
  /** Index of the first qualifying round the player was eligible for. */
  joinedRound: number;
}

export type CupPick =
  | { kind: 'cup'; cupId: string }
  | { kind: 'tracks'; trackIds: string[] };

export type HeatResult =
  | { mode: 'per-race'; races: string[][] } // finishing order per race
  | { mode: 'totals'; points: Record<string, number>; order: string[] } // order = heat placing, best first
  | { mode: 'ranking'; order: string[] }; // final cup order only; points = table[place] × races

export interface Heat {
  id: string;
  playerIds: string[];
  cup?: CupPick;
  result?: HeatResult;
  savedAt?: number;
  /** When the result was first saved (edits don't move it); used to measure heat times. */
  finishedAt?: number;
}

export interface Round {
  id: string;
  index: number; // 0-based qualifying round number
  heats: Heat[]; // array order = play order
  createdAt: number;
  /** Players who sat out this round: classic n=5 at max 4; knockout heat size 2 with an odd field (they advance). */
  byes: string[];
  /** Knockout: top X of each heat that go on (frozen when the round is generated). */
  advance?: number;
  /** Knockout: fill-up mode of this round (frozen when the round is generated). */
  fill?: FillMode;
  /** Knockout: this round is the final (one heat). */
  final?: boolean;
  /** Knockout: seeded entrants (rounds after the first), to notice when an edit changes them. */
  entrants?: string[];
  /** Knockout: Last Chance heat for the fill-up places, raced after the round's heats. */
  lastChance?: Heat;
}

export interface StageConfig {
  name: string;
  fieldSize: number;
  heatSize: number;
  /** How many of each heat move on. 0 for the final stage. */
  advancePerHeat: number;
  /** Extra spots in this stage that are won through a Last Chance heat. */
  wildcards: number;
}

export interface FinalsStage {
  config: StageConfig;
  /** Seeded entrants, best seed first. */
  seeds: string[];
  heats: Heat[];
  /** Last Chance heat feeding this stage's wildcard spots (played before it). */
  lastChance?: Heat;
}

export interface FinalsState {
  stages: FinalsStage[];
  /** Qualifying standings order frozen at the moment the finals started. */
  qualifyingOrder: string[];
  startedAt: number;
}

export interface SuddenDeath {
  /** Sorted, comma-joined ids of the tied group. */
  key: string;
  /** Organizer-chosen order after the shoot-out, best first. */
  order: string[];
}

export type Phase = 'registration' | 'qualifying' | 'finals' | 'podium';

export interface Tournament {
  version: 2;
  id: string;
  settings: Settings;
  players: Player[];
  rounds: Round[];
  finals: FinalsState | null;
  suddenDeath: SuddenDeath[];
  createdAt: number;
  /** Increments every time a round preview is generated so seeds never repeat. */
  rngCounter: number;
}

/** Computed per player for one scored heat. */
export interface HeatScore {
  playerId: string;
  points: number;
  place: number; // 1-based placing inside the heat
}
