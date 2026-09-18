// World state. Plain JSON — whole object is the save file.
import type { Contract, Position, SeasonStats, Team } from './types';
import type { PlayerRatings } from './ratings';

export interface StatLine {
  gp: number; gs: number; min: number; pts: number;
  fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
  orb: number; drb: number; ast: number; stl: number; blk: number; tov: number; pf: number; pm: number;
}

export const emptyLine = (): StatLine => ({
  gp: 0, gs: 0, min: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
  orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pm: 0,
});

export interface Injury { name: string; daysLeft: number }

export interface Player {
  id: string;
  firstName: string; lastName: string;
  teamId: string | null;          // null = free agent
  jersey: string;
  positions: Position[];
  heightCm: number; weightKg: number; birthDate: string; country: string;
  draft: { year: number; round: number; pick: number } | null;
  yearsPro: number;
  face: string | null;
  ratings: PlayerRatings;
  contract: Contract | null;
  history: SeasonStats[];         // real past seasons, newest first
  season: StatLine;               // current regular season
  playoffs: StatLine;
  injury: Injury | null;
  morale: number;                 // 0–100
}

export interface Tactics {
  pace: number;        // 0–100, 50 = league avg
  threeFocus: number;  // 0–100
  crashGlass: number;  // 0–100
}

export interface TeamState extends Team {
  rotation: string[];              // depth chart, [0..4] starters
  minutes: Record<string, number>; // target minutes, sums ~240
  tactics: Tactics;
}

export type GameType = 'regular' | 'playin' | 'playoff';

export interface BoxLine extends StatLine { id: string; starter: boolean }

export interface GameResult {
  home: number; away: number;
  periods: [number, number][];      // per period [home, away]
  box?: { home: BoxLine[]; away: BoxLine[] };
}

export interface Game {
  id: number;
  date: string;         // YYYY-MM-DD
  home: string; away: string;
  type: GameType;
  seriesId?: string;
  result?: GameResult;
}

export interface Series {
  id: string;           // e.g. "R1-East-1v8", "PI-West-7v8", "Finals"
  kind: 'playin' | 'playoff';
  round: number;        // play-in: 0; playoffs 1–4
  conf: 'East' | 'West' | null;
  high: string; low: string;      // high = home court
  winsHigh: number; winsLow: number;
  bestOf: number;
  winner?: string;
  slot?: string;        // bracket slot, e.g. "E1" (1v8 side) — used to pair next round
}

export type Phase = 'preseason' | 'regular' | 'playin' | 'playoffs' | 'offseason';

export interface Message {
  id: number; date: string; from: string; subject: string; body: string; read: boolean;
  kind: 'result' | 'injury' | 'board' | 'league' | 'other';
}

export interface GameState {
  version: 1;
  seed: number;
  season: string;       // "2026-27"
  seasonYear: number;   // 2026 (start year)
  date: string;
  phase: Phase;
  userTeamId: string;
  teams: Record<string, TeamState>;
  players: Record<string, Player>;
  games: Game[];
  series: Series[];
  champion?: string;
  messages: Message[];
  nextId: number;
}
