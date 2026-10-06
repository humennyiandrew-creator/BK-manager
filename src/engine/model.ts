// World state. Plain JSON — whole object is the save file.
import type { Contract, Position, SeasonStats, Team } from './types';
import type { Attr, PlayerRatings } from './ratings';
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
  retiredSeason?: string;         // season he retired after (old retirees are pruned from saves)
  ovrHistory?: { season: string; ovr: number; pot: number }[];
  lastChange?: number;            // OVR change from last progression tick (UI arrows)
  prog?: number;                  // fractional OVR progress accumulator
  form?: number;                  // performance vs rating expectation, −3..+3 (weekly)
  fatigue?: number;               // 0–100 accumulated load; lowers starting energy in games
  devPlan?: Attr;                 // individual development target attribute
  program?: DevProgram;           // active development programme
  lastMeeting?: string;           // date of last 1-on-1
  loan?: { parent: string; until: string }; // on loan from another club
  potSeason?: number;             // POT change this season from performance (UI)
  minutesPromise?: { baselineMpg: number; checkDate: string; season: string }; // dynamic event follow-up
  arc?: SeasonArc;                // rare breakout / collapse season in progress
  arcHistory?: { season: string; kind: ArcKind; style: ArcStyle; delta: number; kept: number }[];
  ovrTrack?: number[];            // weekly OVR this season (in-season trend line)
  assigned?: boolean;             // on the NBA roster but playing for the club's G League affiliate
  affiliate?: string;             // unsigned G League player: parent NBA team id of his affiliate
  gl?: { season: string; gp: number; min: number; pts: number; reb: number; ast: number }; // G League line
}

// ---------- season arcs: rare breakouts and collapses ----------

export type ArcKind = 'breakout' | 'collapse';
export type ArcStyle =
  | 'shooter' | 'creator' | 'athlete' | 'stopper' | 'scorer' | 'allround'   // breakouts
  | 'confidence' | 'body' | 'nagging' | 'focus';                            // collapses
export interface SeasonArc {
  season: string;
  kind: ArcKind;
  style: ArcStyle;
  magnitude: number;              // target OVR change over the season (signed)
  startWeek: number;              // progression week the arc starts showing
  rampWeeks: number;              // weeks from start to full effect
  applied: number;                // OVR change applied so far (signed)
  revealed?: boolean;             // the league has noticed (news + user decision)
  eventDone?: boolean;            // user decision event already raised
  keep?: number;                  // ± adjustment to how much survives into next season
  locked?: boolean;               // frozen at its current depth (user decision)
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
  familiarity?: number;            // 0–100 how well the team knows its current offense/defense (practice + time)
  chemistry?: number;              // 0–100 locker-room chemistry (weekly), a small on-court edge
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
  comp?: string;        // competition id, default 'NBA'
  type: GameType;
  seriesId?: string;
  result?: GameResult;
}

export interface Series {
  id: string;
  comp?: string;        // competition id, default 'NBA'           // e.g. "R1-East-1v8", "PI-West-7v8", "Finals"
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
  important?: boolean;    // UI-derived (Inbox v2); persisted once computed so it survives saves
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
  elChampion?: string;            // EuroLeague winner (other competitions crown their own champions)
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
  maxSeasons: number;                      // career length in seasons; 0 = open-ended
  offseason?: { stage: OffseasonStage; faDay: number; waitingPick?: string };
  history: SeasonRecord[];                 // one per completed season
  careerOver?: boolean;
  // ---- dynamic events ----
  events: GameEvent[];
  scouting: Scouting;
  prep?: OpponentPrep;
  press?: Press;
  promises: BoardPromise[];
  manager: ManagerCareer;
  negotiations: Negotiation[];            // contract talks (user team), open + recent
  bids: TransferBid[];                    // European transfer market                     // pending + resolved log, newest first, kept to 60
  offseasonEventStage?: string;            // last offseason stage an event was rolled for
  // ---- living world (optional: older saves fill these in lazily) ----
  news?: NewsItem[];                       // league wire, newest first, capped
  powerRankings?: PowerRankings;           // weekly power rankings per competition
  matchObjectives?: MatchObjectiveSet;     // sponsor goals for the user's next game
  objectiveLog?: { gameId: number; date: string; met: number; total: number; earned: number }[];
  lockerRoom?: LockerRoom;                 // user team captain + team activities
  weekly?: Record<string, WeeklyLine>;     // this week's per-player production (Player of the Week)
}

export interface WeeklyLine { g: number; score: number; pts: number; reb: number; ast: number }

// ---------- living world: news wire, power rankings ----------

export type NewsKind = 'breakout' | 'slump' | 'performance' | 'streak' | 'injury' | 'award' | 'rankings' | 'milestone' | 'other';
export interface NewsItem {
  id: number; date: string; kind: NewsKind;
  headline: string; body?: string;
  teamId?: string; playerId?: string;
  tone?: 'good' | 'bad' | 'neutral';
}
export interface PowerRankings {
  date: string;
  /** competition id → team ids, best first */
  ranks: Record<string, string[]>;
  prev: Record<string, string[]>;
}

// ---------- sponsor match objectives ----------

export type ObjectiveStat =
  | 'win' | 'margin' | 'oppPts' | 'threes' | 'rebounds' | 'turnovers' | 'assists' | 'bench'
  | 'playerPts' | 'playerReb' | 'playerAst' | 'steals' | 'blocks' | 'fgPct';
export interface MatchObjective {
  id: string;
  sponsor: string;
  stat: ObjectiveStat;
  target: number;                  // threshold (≥ unless `under`)
  under?: boolean;                 // met when value ≤ target
  playerId?: string;
  label: string;
  reward: number;
  hype: number;                    // fan hype on success
  result?: { value: number; met: boolean };
}
export interface MatchObjectiveSet { gameId: number; list: MatchObjective[]; settled?: boolean }

// ---------- locker room ----------

export type TeamActivityId = 'dinner' | 'retreat' | 'playersMeeting' | 'community' | 'film';
export interface LockerRoom {
  captain?: string;                // player id
  lastActivity?: Partial<Record<TeamActivityId, string>>; // activity → date last run
  bond?: number;                   // −10..+10 temporary chemistry from activities, decays weekly
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
  xp?: number;                       // experience towards a rating point
  course?: { name: string; weeksLeft: number; gain: number; cost: number };
  rating: number;        // 1–100
  age: number; salary: number; years: number;
  teamId: string | null;
}

export type FacilityId = 'training' | 'medical' | 'arena' | 'scouting' | 'analytics';
export interface Facility {
  level: number;         // 1–5
  nodes?: string[];      // unlocked upgrade-tree nodes
  building?: { node: string; done: string; cost: number };
  upgrade?: { to: number; done: string; cost: number };
}

export type RevenueCat = 'tickets' | 'tv' | 'merch' | 'sponsors' | 'playoffs';
export type ExpenseCat = 'salaries' | 'staff' | 'facilities' | 'tax' | 'operations';
export interface Finances {
  cash: number;
  sponsors?: SponsorDeal[];
  hype?: number;                     // 0–100 fan/media buzz: drives attendance, merch and sponsor offers
  themeNights?: number;              // promo nights booked this season
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
export type Session = 'high' | 'light' | 'shootaround' | 'film' | 'rest';
export interface TrainingPlan {
  schedule?: Session[];                    // 7 days Mon..Sun; game days override to shootaround
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

// ---------- A4: negotiations ----------
export interface ContractOffer { amount: number; years: number; playerOption?: boolean; teamOption?: boolean; incentives?: number }
export interface Negotiation {
  id: number; playerId: string; teamId: string;
  kind: 'fa' | 'resign' | 'extension';
  round: number; patience: number;          // agent patience 0–100; walks at 0
  ask: ContractOffer;                        // agent's current demand (visible)
  floor: number;                             // hidden minimum annual amount he'd accept now
  rivals: number;                            // other teams interested (raises ask)
  status: 'open' | 'signed' | 'walked';
  log: { by: 'team' | 'agent'; text: string; offer?: ContractOffer }[];
  date: string;
}

// ---------- C: between-match activities ----------

export type ProgramKind = 'skill' | 'position' | 'physical' | 'mental';
export interface DevProgram {
  kind: ProgramKind;
  label: string;
  target: Attr | Position;           // attribute to raise, or new position for a role change
  weeksLeft: number; weeksTotal: number;
  progress: number;                  // 0–100
  risk: number;                      // 0–1 chance of a setback at the end
}

export type ScoutTargetKind = 'region' | 'college' | 'player' | 'opponent';
export interface ScoutAssignment {
  id: number; staffId: string | null;
  kind: ScoutTargetKind; key: string;   // region/conference name, player id, or team id
  label: string;
  weeksLeft: number; weeksTotal: number;
  cost: number;
}
export interface Scouting {
  assignments: ScoutAssignment[];
  knowledge: Record<string, number>;    // prospect id → 0–1 extra accuracy from scouting
  shortlist: string[];                  // prospect ids the user is tracking
}

export interface OpponentPrep {
  gameId: number;
  opponent: string;
  report: { pace: number; threeRate: number; rimRate: number; star: string; scheme: string; weakness: string };
  plan: 'contain-star' | 'take-away-three' | 'protect-rim' | 'force-turnovers' | 'run-them' | null;
  prepared: boolean;                    // set when the user reviews + picks a plan before the game
}

export interface PressQuestion { id: string; text: string; choices: { id: string; label: string; tone: 'calm' | 'bold' | 'blunt' | 'deflect' }[] }
export interface Press {
  pending?: { date: string; questions: PressQuestion[]; answered: string[] };
  lastDate?: string;
}

export interface BoardPromise {
  id: number; date: string;
  kind: 'playoffs' | 'wins' | 'develop' | 'payroll' | 'title';
  target: number; label: string;
  deadline: string;
  status: 'open' | 'kept' | 'broken';
  reward: { budget?: number; confidence: number };
}

export interface SponsorDeal {
  id: number; name: string; tier: 'local' | 'national' | 'global';
  perSeason: number; years: number;
  bonus: { kind: 'playoffs' | 'title' | 'wins'; target: number; amount: number };
  requiresHype: number;
  signed: string;                       // date
}

// ---------- manager career ----------

export interface JobOffer {
  id: number; date: string; teamId: string;
  league: string; objective: ObjectiveKind;
  salary: number; years: number;
  budget: number;                    // wage budget / payroll room the club promises
  expires: string;
  reason: string;                    // why the seat is open
}

export interface ManagerCareer {
  name: string;
  reputation: number;                // 0–100, drives which clubs come calling
  unemployed: boolean;
  hiredOn: string;                   // date the current job started
  salary: number;
  contractYears: number;
  hotSeat: number;                   // 0–100 risk of being sacked
  offers: JobOffer[];
  history: { teamId: string; from: string; to?: string; record: string; result: string }[];
}

// ---------- European transfer market ----------

export interface TransferBid {
  id: number; date: string;
  playerId: string;
  fromTeam: string;                  // selling club
  toTeam: string;                    // buying club
  fee: number;
  wage: number; years: number;       // terms offered to the player
  status: 'pending' | 'accepted' | 'rejected' | 'completed' | 'withdrawn';
  fromUser: boolean;                 // true when the user's club is buying
  note?: string;
  expires: string;
}
