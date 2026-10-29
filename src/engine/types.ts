// Tournament data model. Everything here is plain JSON-serialisable data so the
// whole tournament can be autosaved, exported, imported and snapshotted for undo.

export type HeatMax = 4 | 8;
export type EntryMode = 'per-race' | 'totals';
export type TrackMode = 'none' | 'random-cup' | 'random-tracks' | 'pick';
export type PlayerStatus = 'registered' | 'checked-in' | 'active' | 'withdrawn';

export interface Settings {
  name: string;
  date: string; // YYYY-MM-DD
  maxPerHeat: HeatMax;
  racesPerHeat: number;
  qualRounds: number;
  /** Points per race, index 0 = 1st place. */
  points8: number[];
  points4: number[];
  entryMode: EntryMode;
  trackMode: TrackMode;
  boosterPass: boolean;
  /** 'auto' picks a preset from the number of eligible players at finals time. */
  finalsFormat: 'auto' | 'custom';
  customStages: StageConfig[];
  lastChance: boolean;
  lastChanceWildcards: 1 | 2;
  minutesPerRace: number;
  changeoverMinutes: number;
  expectedPlayers: number;
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
  | { mode: 'totals'; points: Record<string, number>; order: string[] }; // order = heat placing, best first

export interface Heat {
  id: string;
  playerIds: string[];
  cup?: CupPick;
  result?: HeatResult;
  savedAt?: number;
}

export interface Round {
  id: string;
  index: number; // 0-based qualifying round number
  heats: Heat[]; // array order = play order
  createdAt: number;
  /** Players who sat out this round because no valid heat split existed (only n=5 at max 4). */
  byes: string[];
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
  version: 1;
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
