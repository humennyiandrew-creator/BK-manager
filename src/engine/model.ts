// World state. Plain JSON — whole object is the save file.
import type { Contract, Position, SeasonStats, Team } from './types';
import type { PlayerRatings } from './ratings';
import type { DefScheme, OffSystem } from './playbook/types';

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
  prospect?: boolean;             // draft prospect (not yet in league)
  college?: string;
  retired?: boolean;
  ovrHistory?: { season: string; ovr: number; pot: number }[];
  lastChange?: number;            // OVR change from last progression tick (UI arrows)
  prog?: number;                  // fractional OVR progress accumulator
  form?: number;                  // performance vs rating expectation, −3..+3 (weekly)
  potSeason?: number;             // POT change this season from performance (UI)
  minutesPromise?: { baselineMpg: number; checkDate: string; season: string }; // dynamic event follow-up
}

export interface Tactics {
  pace: number;        // 0–100, 50 = league avg
  threeFocus: number;  // 0–100
  crashGlass: number;  // 0–100
  transition: number;  // 0–100, how often to push after rebounds/steals
  offense: OffSystem;
  defense: DefScheme;
  playWeights: Record<string, number>; // user overrides of system play frequencies (0 = off)
  focusPlayer: string | null;
  clutchPlay: string | null;           // play run in last 2 min of close games
}

export interface TeamState extends Team {
  rotation: string[];              // depth chart, [0..4] starters
  minutes: Record<string, number>; // target minutes, sums ~240
  tactics: Tactics;
  customRotation?: boolean;        // user-set depth chart: injuries only shuffle, never rebuild
  mleUsed?: boolean;               // mid-level exception used this season
  deadCap?: { season: string; amount: number }[]; // waived salary still on the cap
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
  kind: 'result' | 'injury' | 'board' | 'league' | 'trade' | 'finance' | 'staff' | 'draft' | 'event' | 'other';
  action?: { type: 'trade-offer'; offerId: number } | { type: 'event'; eventId: string };
}

export interface GameEvent {
  id: string; date: string; type: string; title: string; body: string;
  teamId: string; playerId?: string; staffId?: string;
  meta?: Record<string, string>;                  // extra ids (e.g. a second player in a fight)
  choices: { id: string; label: string; hint: string }[];
  resolved?: { choiceId: string; outcome: string };
  expires: string;
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
  // ---- M6 management ----
  staff: Staff[];                          // all staff, teamId null = available to hire
  facilities: Record<string, Record<FacilityId, Facility>>; // teamId → facilities
  finance: Finances;                       // user team only
  board: Board;                            // user team only
  training: Record<string, TrainingPlan>;  // teamId → plan (AI teams use defaults)
  picks: DraftPick[];
  tradeOffers: TradeOffer[];               // pending offers to the user
  transactions: Transaction[];             // league-wide log
  draftClass: string[];                    // player ids of upcoming draft prospects (teamId null, prospect true)
  draftOrder: string[];                    // pick ids in selection order once the lottery has run
  keyDates: KeyDates;
  // ---- M7 career ----
  startYear: number;                       // first season of the career
  maxSeasons: number;                      // career length cap (5)
  offseason?: { stage: OffseasonStage; faDay: number; waitingPick?: string };
  history: SeasonRecord[];                 // one per completed season
  careerOver?: boolean;
  // ---- dynamic events ----
  events: GameEvent[];                     // pending + resolved log, newest first, kept to 60
  offseasonEventStage?: string;            // last offseason stage an event was rolled for
}

export type OffseasonStage = 'draft' | 'resign' | 'fa' | 'camp';

export interface Awards { mvp: string; dpoy: string; roy: string | null; sixth: string | null; mip: string | null; allNba: string[] }
export interface SeasonRecord {
  season: string;
  w: number; l: number; confRank: number;
  result: string;                          // e.g. "Lost Conf Finals 2-4", "Champions"
  champion: string;                        // teamId
  awards: Awards;
  objective: string; objectiveMet: boolean;
  topScorer: { id: string; ppg: number };
}

// ---------- M6 types ----------

export type StaffRole = 'assistantOff' | 'assistantDef' | 'development' | 'medical' | 'scout' | 'analytics';
export interface Staff {
  id: string; name: string; role: StaffRole;
  rating: number;        // 1–100
  age: number; salary: number; years: number;
  teamId: string | null;
}

export type FacilityId = 'training' | 'medical' | 'arena' | 'scouting' | 'analytics';
export interface Facility {
  level: number;         // 1–5
  upgrade?: { to: number; done: string; cost: number };
}

export type RevenueCat = 'tickets' | 'tv' | 'merch' | 'sponsors' | 'playoffs';
export type ExpenseCat = 'salaries' | 'staff' | 'facilities' | 'tax' | 'operations';
export interface Finances {
  cash: number;
  ticketPrice: number;                     // avg ticket, USD
  revenue: Record<RevenueCat, number>;     // this season
  expense: Record<ExpenseCat, number>;     // this season
  monthly: { month: string; revenue: number; expense: number; cash: number }[];
  attendance: number[];                    // last home games, fraction of capacity
  sponsorBonus?: number;                   // extra $/month from a long-term sponsor deal event
}

export type ObjectiveKind = 'title' | 'finals' | 'confFinals' | 'playoffs' | 'playin' | 'develop';
export interface Board {
  confidence: number;                      // 0–100
  objective: ObjectiveKind;
  longTerm: string;
  budgetMul: number;                       // 0.8–1.2 multiplier on staff/facility budgets, driven by confidence
  history: { season: string; objective: ObjectiveKind; result: string; met: boolean }[];
}

export type TrainingFocus = 'balanced' | 'shooting' | 'finishing' | 'playmaking' | 'defense' | 'rebounding' | 'conditioning';
export interface TrainingPlan {
  intensity: number;                       // 1–5: growth vs fatigue/injury risk
  focus: TrainingFocus;
  individual: Record<string, TrainingFocus>; // playerId → personal focus
}

export interface DraftPick {
  id: string;             // "2027-1-LAL"
  year: number; round: 1 | 2;
  original: string;       // teamId
  owner: string;          // teamId
}

export interface TradeSide { players: string[]; picks: string[] }
export interface TradeOffer {
  id: number; date: string;
  from: string; to: string;               // teamIds (to = user)
  give: TradeSide;                        // what `from` sends
  get: TradeSide;                         // what `from` receives
  expires: string;
}

export interface Transaction { date: string; kind: 'trade' | 'sign' | 'release' | 'draft' | 'extend' | 'retire'; text: string; teams: string[] }

export interface KeyDates {
  tradeDeadline: string; regularEnd: string; draft: string; freeAgency: string;
}
