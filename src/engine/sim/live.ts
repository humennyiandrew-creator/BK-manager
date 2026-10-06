// Live 2D match. Same possession core as the fast sim (decide → events), but every possession is
// animated on a 94×50 ft court: play scripts move the offense, scheme rules move the defense,
// and each event is committed to the box score when its animation beat fires.
import type { GameResult, Player, TeamState } from '../model';
import { hashString, mulberry32, type Rng } from '../rng';
import { SCHEMES } from '../playbook/systems';
import type { Role, Spot } from '../playbook/types';
import { S } from '../playbook/plays';
import {
  NBA_RULES, commitEvent, decide, doSubs, drainFor, makeSide, possessionLength, sortCourt, tickEnergy,
  type Ev, type Outcome, type Rules, type ShotType, type SP, type Side, type TalkBoost,
  lateDuration,
} from './fast';
import { injuryRatePerMinute, rollInjuryType } from '../injuries';

export const COURT = { w: 94, h: 50, hoop: 5.25 };

export interface Ent { id: string; side: 0 | 1; x: number; y: number; tx: number; ty: number }
export interface BallState { x: number; y: number; z: number; holder: string | null }
export interface PbpLine { period: number; clock: number; text: string; home: number; away: number; side: 0 | 1 | null; kind: 'score' | 'miss' | 'to' | 'foul' | 'reb' | 'info' | 'sub' }
export type MatchState = 'pregame' | 'live' | 'timeout' | 'break' | 'final';
export type Intensity = -1 | 0 | 1;
export type TeamTalk = 'calm' | 'fire' | 'attack';

/** Timeout team talks: a short-lived edge for the next few trips down the floor. */
export const TALKS: Record<TeamTalk, { label: string; hint: string; boost: Omit<TalkBoost, 'left'> }> = {
  calm: { label: 'Settle down', hint: 'Value the ball — far fewer turnovers for the next few trips.', boost: { edge: 0.004, toMul: 0.7, defEdge: 0 } },
  fire: { label: 'Turn up the heat', hint: 'Lock in on defense — tougher looks for them for a few trips.', boost: { edge: 0, toMul: 1, defEdge: 0.02 } },
  attack: { label: 'Attack the mismatch', hint: 'Better shots on offense, at a little more turnover risk.', boost: { edge: 0.02, toMul: 1.12, defEdge: 0 } },
};
const TALK_POSSESSIONS = 12;

/** Shot location in half-court feet (basket at x=5.25, y=25), whichever end it was taken at. */
export interface ShotMark { side: 0 | 1; x: number; y: number; made: boolean; three: boolean; id: string; period: number }
export interface FlowPoint { t: number; margin: number; wp: number }
export interface Run { side: 0 | 1; a: number; b: number }

export interface Snapshot {
  state: MatchState;
  period: number; clock: number; shotClock: number;
  score: [number, number];
  possession: 0 | 1;
  players: { id: string; side: 0 | 1; x: number; y: number; jersey: string; name: string; energy: number; fouls: number; ball: boolean; streak: number }[];
  ball: BallState;
  screens: [string, string][];
  play: string | null;             // offense play currently running
  timeouts: [number, number];
  bonus: [boolean, boolean];
  pbp: PbpLine[];
  intensity: [Intensity, Intensity];
  momentum: number;                // −1..1, positive = home on top lately
  run: Run | null;                 // current scoring run (≥ 8 points, opponent ≤ 2)
  winProb: number;                 // home win probability 0–1
  talk: [TeamTalk | null, TeamTalk | null]; // active team-talk effect per side
}

interface Beat { at: number; fn: () => void }
interface Flight { fx: number; fy: number; tx: number; ty: number; t: number; dur: number; arc: number; to: string | null; land?: () => void }

const name = (sp: SP) => sp.p.lastName;
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
const FT_SPOTS: Spot[] = [{ x: 7, y: 17 }, { x: 7, y: 33 }, { x: 10, y: 17 }, { x: 10, y: 33 }, { x: 13, y: 17 }, { x: 13, y: 33 }, { x: 27, y: 15 }, { x: 27, y: 35 }, { x: 30, y: 25 }];

export class LiveMatch {
  readonly H: Side; readonly A: Side;
  readonly rules: Rules;
  readonly userSide: 0 | 1 | null;
  state: MatchState = 'pregame';
  period = 1; clock: number; shotClock = 24;
  timeouts: [number, number] = [7, 7];
  autoSubs: [boolean, boolean] = [true, true];
  pbp: PbpLine[] = [];
  shots: ShotMark[] = [];
  flow: FlowPoint[] = [];
  talkUsed: [boolean, boolean] = [false, false];

  private rng: Rng;
  private ents = new Map<string, Ent>();
  private ball: BallState = { x: 47, y: 25, z: 8, holder: null };
  private flight: Flight | null = null;
  private beats: Beat[] = [];
  private tPoss = 0; private endAt = 0;
  private off!: Side;
  private o: Outcome | null = null;
  private prevKeep = false; private prevTransition = false; private prevEvent = '';
  private clockRunning = true;
  private shotReleased = false;
  private screens: [string, string][] = [];
  private tipWinner!: Side;
  private pendingTimeout: [boolean, boolean] = [false, false];
  private pendingSubs: { side: 0 | 1; out: string; in: string }[] = [];
  private calledPlay: [string | null, string | null] = [null, null];
  private run: [number, number] = [0, 0];        // points since last timeout (AI timeout trigger)
  private elapsed = 0;
  private drain: number;
  private defTick = 0;
  private forceDead = false;
  private scoreLog: { t: number; side: 0 | 1; pts: number }[] = [];
  private streaks = new Map<string, number>();   // consecutive FG makes (+) / misses (−)
  private talkOn: [TeamTalk | null, TeamTalk | null] = [null, null];
  private prior: number;                          // pre-game expected home margin
  private foulCall: [boolean, boolean] = [false, false]; // "foul now" for the next defensive possession
  private injuries: { id: string; name: string; days: number }[] = [];
  private injuryStop = false;

  constructor(home: TeamState, away: TeamState, players: Record<string, Player>, seed: number, userSide: 0 | 1 | null, rules = NBA_RULES) {
    this.rules = rules;
    this.userSide = userSide;
    this.rng = mulberry32(hashString(`live|${seed}`));
    this.H = makeSide(home, players, true);
    this.A = makeSide(away, players, false);
    this.clock = rules.periodSec;
    this.timeouts = this.fiba ? [2, 2] : [7, 7];
    this.drain = drainFor(home, away);
    const str = (s: Side) => s.roster.slice(0, 8).reduce((x, sp) => x + sp.p.ratings.ovr, 0) / Math.max(1, Math.min(8, s.roster.length));
    this.prior = (str(this.H) - str(this.A)) * 1.1 + 2;
    this.flow = [{ t: 0, margin: 0, wp: this.winProb() }];
    for (const s of [this.H, this.A]) for (const sp of s.court) this.addEnt(sp, s, 47, 25);
    this.tipOffSetup();
  }

  // ---------- public API ----------

  sideOf = (s: Side): 0 | 1 => (s === this.H ? 0 : 1);
  sideObj = (i: 0 | 1) => (i === 0 ? this.H : this.A);

  /** FIBA: 2 timeouts in the first half, 3 in the second. NBA: 7, capped at 4 after halftime. */
  get fiba() { return this.rules.periodSec === 600; }
  maxTimeouts() { return this.fiba ? (this.period <= 2 ? 2 : 3) : this.period >= 3 ? 4 : 7; }
  setIntensity(side: 0 | 1, v: Intensity) { this.sideObj(side).intensity = v; }
  /** One team talk per timeout, only during that side's huddle. */
  teamTalk(side: 0 | 1, talk: TeamTalk): boolean {
    if (this.state !== 'timeout' || this.talkUsed[side]) return false;
    this.talkUsed[side] = true;
    this.talkOn[side] = talk;
    this.sideObj(side).boost = { left: TALK_POSSESSIONS, ...TALKS[talk].boost };
    this.log(side, 'info', `${this.sideObj(side).team.abbr} huddle: "${TALKS[talk].label}"`);
    return true;
  }
  requestTimeout(side: 0 | 1) { if (this.timeouts[side] > 0) this.pendingTimeout[side] = true; }
  /** Foul on purpose on the next defensive possession. */
  foulNow(side: 0 | 1) { this.foulCall[side] = true; }
  foulPending(side: 0 | 1) { return this.foulCall[side]; }
  /** Players hurt during this game (they take no further part). */
  hurt() { return this.injuries; }
  callPlay(side: 0 | 1, playId: string | null) { this.calledPlay[side] = playId; }
  sub(side: 0 | 1, outId: string, inId: string) { this.pendingSubs.push({ side, out: outId, in: inId }); }
  resume() { if (this.state === 'timeout' || this.state === 'break') { this.forceDead = true; this.startPossession(); } }

  start() {
    if (this.state !== 'pregame') return;
    this.state = 'live';
    // Tip: centers jump, weighted by vertical + height.
    const jumper = (s: Side) => s.court[s.court.length - 1];
    const score = (sp: SP) => sp.p.ratings.attrs.vertical + sp.p.heightCm / 3;
    const h = jumper(this.H), a = jumper(this.A);
    this.tipWinner = this.rng() < score(h) / (score(h) + score(a)) ? this.H : this.A;
    const winner = this.tipWinner.court[0];
    this.log(null, 'info', `Tip-off won by ${name(this.tipWinner === this.H ? h : a)} (${this.tipWinner.team.abbr})`);
    this.throwBall(this.entOf(winner).x, this.entOf(winner).y, 0.9, 4, winner.p.id);
    this.off = this.tipWinner;
    this.prevTransition = false;
    this.beats = [{ at: 1, fn: () => this.startPossession() }];
    this.tPoss = 0; this.endAt = 99;
  }

  /** Advance simulation by dt seconds of game time. Call with small dt (≤0.1). */
  step(dt: number) {
    if (this.state !== 'live') return;
    this.tPoss += dt;
    if (this.clockRunning) {
      this.clock = Math.max(0, this.clock - dt);
      this.shotClock = Math.max(0, this.shotClock - dt);
      tickEnergy(this.H, dt, this.drain); tickEnergy(this.A, dt, this.drain);
      this.elapsed += dt;
    }
    this.moveBall(dt);
    this.defTick -= dt;
    if (this.defTick <= 0) { this.defTick = 0.2; this.placeDefense(); }
    this.moveEnts(dt);

    while (this.beats.length && this.beats[0].at <= this.tPoss && this.state === 'live') this.beats.shift()!.fn();
    if (this.state !== 'live') return;

    if (this.clock <= 0 && !this.shotReleased && this.clockRunning) { this.endPeriod(); return; }
    if (!this.beats.length && this.tPoss >= this.endAt) this.nextPossession();
  }

  snapshot(): Snapshot {
    const players: Snapshot['players'] = [];
    for (const s of [this.H, this.A]) for (const sp of s.court) {
      const e = this.entOf(sp);
      players.push({ id: sp.p.id, side: this.sideOf(s), x: e.x, y: e.y, jersey: sp.p.jersey, name: name(sp), energy: sp.energy, fouls: sp.line.pf, ball: this.ball.holder === sp.p.id, streak: this.streaks.get(sp.p.id) ?? 0 });
    }
    return {
      state: this.state, period: this.period, clock: this.clock, shotClock: this.shotClock,
      score: [this.H.pts, this.A.pts], possession: this.off ? this.sideOf(this.off) : 0,
      players, ball: { ...this.ball }, screens: this.screens, play: this.o?.play.name ?? null,
      timeouts: [...this.timeouts] as [number, number],
      bonus: [this.A.fouls >= this.rules.bonusAt, this.H.fouls >= this.rules.bonusAt],
      pbp: this.pbp,
      intensity: [this.H.intensity ?? 0, this.A.intensity ?? 0],
      momentum: this.momentum(), run: this.currentRun(), winProb: this.winProb(),
      talk: [this.H.boost ? this.talkOn[0] : null, this.A.boost ? this.talkOn[1] : null],
    };
  }

  // ---------- game flow analytics ----------

  /** Net scoring over the last ~2.5 minutes of game time, scaled to −1..1. */
  momentum(): number {
    let h = 0, a = 0;
    for (let i = this.scoreLog.length - 1; i >= 0 && this.elapsed - this.scoreLog[i].t <= 150; i--) {
      if (this.scoreLog[i].side === 0) h += this.scoreLog[i].pts; else a += this.scoreLog[i].pts;
    }
    return Math.max(-1, Math.min(1, (h - a) / 12));
  }

  /** Biggest run still going: one side scoring 8+ while the other manages 2 or fewer. */
  currentRun(): Run | null {
    let best: Run | null = null;
    for (const side of [0, 1] as const) {
      let a = 0, b = 0;
      for (let i = this.scoreLog.length - 1; i >= 0; i--) {
        const e = this.scoreLog[i];
        if (e.side === side) a += e.pts;
        else if (b + e.pts > 2) break;
        else b += e.pts;
      }
      if (a >= 8 && (!best || a > best.a)) best = { side, a, b };
    }
    return best;
  }

  /** Home win probability from margin, time left and the pre-game edge. */
  winProb(): number {
    const total = this.rules.periods * this.rules.periodSec;
    const left = this.period > this.rules.periods ? this.clock : (this.rules.periods - this.period) * this.rules.periodSec + this.clock;
    const frac = Math.max(0, left / total);
    const margin = this.H.pts - this.A.pts;
    if (this.state === 'final') return margin > 0 ? 1 : 0;
    const sigma = (this.fiba ? 10.5 : 12.5) * Math.sqrt(frac) + 0.6;
    return normCdf((margin + this.prior * frac) / sigma);
  }

  private noteScore(side: 0 | 1, pts: number) {
    this.scoreLog.push({ t: this.elapsed, side, pts });
  }

  private noteShot(off: Side, shooter: SP, ev: Ev & { k: 'shot' }, x: number, y: number) {
    const right = this.hoop(off).x > 47;
    this.shots.push({
      side: this.sideOf(off), x: right ? COURT.w - x : x, y: right ? COURT.h - y : y,
      made: ev.made, three: ev.type === 'three', id: shooter.p.id, period: this.period,
    });
    const cur = this.streaks.get(shooter.p.id) ?? 0;
    this.streaks.set(shooter.p.id, ev.made ? Math.max(0, cur) + 1 : Math.min(0, cur) - 1);
  }

  /** AI coaches push late in close games and ease off in blowouts or when gassed. */
  private aiIntensity(i: 0 | 1) {
    const s = this.sideObj(i);
    const margin = i === 0 ? this.H.pts - this.A.pts : this.A.pts - this.H.pts;
    const late = this.period >= this.rules.periods && this.clock < 300;
    const energy = s.court.reduce((x, sp) => x + sp.energy, 0) / Math.max(1, s.court.length);
    s.intensity = late && Math.abs(margin) <= 8 ? 1 : margin >= 18 || energy < 0.5 ? -1 : 0;
  }

  result(): GameResult {
    const box = (s: Side) => s.roster.map((sp) => ({ ...sp.line, min: Math.round(sp.sec / 6) / 10, gp: sp.sec > 0 ? 1 : 0 }));
    return { home: this.H.pts, away: this.A.pts, periods: this.periodScores, box: { home: box(this.H), away: box(this.A) }, liveInjuries: [...this.injuries] };
  }

  /** Finish the rest of the game instantly (user pressed "Sim to end"). */
  simToEnd() {
    let guard = 0;
    while (this.state !== 'final' && guard++ < 200000) {
      if (this.state === 'timeout' || this.state === 'break' || this.state === 'pregame') {
        if (this.state === 'pregame') this.start(); else this.resume();
      }
      this.step(0.1);
    }
  }

  // ---------- geometry ----------

  /** Home attacks right in the first half. */
  private attacksRight(s: Side) { return (s === this.H) === (this.period <= 2); }
  private full(s: Side, p: Spot): Spot { return this.attacksRight(s) ? { x: COURT.w - p.x, y: COURT.h - p.y } : { x: p.x, y: p.y }; }
  private hoop(s: Side): Spot { return this.full(s, { x: COURT.hoop, y: 25 }); }
  private entOf(sp: SP): Ent { return this.ents.get(sp.p.id)!; }
  private other(s: Side) { return s === this.H ? this.A : this.H; }

  private addEnt(sp: SP, s: Side, x: number, y: number) {
    this.ents.set(sp.p.id, { id: sp.p.id, side: this.sideOf(s), x, y, tx: x, ty: y });
  }

  private target(sp: SP, p: Spot) { const e = this.entOf(sp); e.tx = p.x; e.ty = p.y; }
  private targetHalf(s: Side, sp: SP, p: Spot, jitter = 1) {
    this.target(sp, this.full(s, { x: p.x + (this.rng() - 0.5) * jitter, y: p.y + (this.rng() - 0.5) * jitter }));
  }

  private moveEnts(dt: number) {
    for (const s of [this.H, this.A]) for (const sp of s.court) {
      const e = this.entOf(sp);
      const v = (9 + sp.p.ratings.attrs.speed * 0.13) * (0.75 + 0.25 * sp.energy);
      const d = dist(e.x, e.y, e.tx, e.ty);
      if (d <= v * dt) { e.x = e.tx; e.y = e.ty; } else { e.x += ((e.tx - e.x) / d) * v * dt; e.y += ((e.ty - e.y) / d) * v * dt; }
    }
  }

  private moveBall(dt: number) {
    const f = this.flight;
    if (f) {
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      this.ball.x = f.fx + (f.tx - f.fx) * k;
      this.ball.y = f.fy + (f.ty - f.fy) * k;
      this.ball.z = 4 + f.arc * 4 * k * (1 - k);
      if (k >= 1) {
        this.flight = null;
        this.ball.holder = f.to;
        f.land?.();
      }
      return;
    }
    const h = this.ball.holder ? this.ents.get(this.ball.holder) : null;
    if (h) { this.ball.x = h.x + 0.8; this.ball.y = h.y + 0.4; this.ball.z = 3; }
  }

  private throwBall(tx: number, ty: number, dur: number, arc: number, to: string | null, land?: () => void) {
    this.flight = { fx: this.ball.x, fy: this.ball.y, tx, ty, t: 0, dur, arc, to, land };
    this.ball.holder = null;
  }
  private passTo(sp: SP, dur = 0.45) { const e = this.entOf(sp); this.throwBall(e.tx, e.ty, dur, 1, sp.p.id); }

  /** Scheme-driven defensive positioning. */
  private placeDefense() {
    if (!this.off) return;
    const off = this.off, def = this.other(off);
    const sch = SCHEMES[def.team.tactics.defense];
    const hoop = this.hoop(off);
    const holder = off.court.find((sp) => sp.p.id === this.ball.holder) ?? null;
    const bx = this.ball.x, by = this.ball.y;
    const inHalf = Math.abs(bx - hoop.x) < 47;
    const guard = (d: SP, m: SP, sag: number) => {
      const e = this.entOf(m);
      const onBall = m === holder;
      const dx = hoop.x - e.x, dy = hoop.y - e.y, L = Math.hypot(dx, dy) || 1;
      const off = onBall ? Math.min(3, L) : L * (0.18 + sag * 0.55);
      this.target(d, { x: e.x + (dx / L) * off, y: e.y + (dy / L) * off });
    };
    const press = sch.id === 'press' && !inHalf;
    if (sch.zone && inHalf && !press) {
      const chaser = sch.id === 'box1' ? def.court.reduce((b, x) => (x.p.ratings.attrs.perimeterD > b.p.ratings.attrs.perimeterD ? x : b)) : null;
      const focus = off.court.find((x) => x.p.id === off.team.tactics.focusPlayer) ?? off.court[0];
      const rest = def.court.filter((d) => d !== chaser);
      const anchors = sch.zone.slice(chaser ? 1 : 0);
      rest.forEach((d, i) => {
        const a = this.full(off, anchors[i] ?? anchors[0]);
        this.target(d, { x: a.x + (bx - a.x) * 0.25, y: a.y + (by - a.y) * 0.3 });
      });
      if (holder) {
        const closest = rest.reduce((b, d) => (dist(this.entOf(d).x, this.entOf(d).y, bx, by) < dist(this.entOf(b).x, this.entOf(b).y, bx, by) ? d : b));
        guard(closest, holder, 0);
      }
      if (chaser) guard(chaser, focus, 0.05);
      return;
    }
    def.court.forEach((d, i) => guard(d, off.court[i] ?? off.court[0], press ? 0 : sch.sag));
  }

  // ---------- flow ----------

  private periodScores: [number, number][] = [];
  private periodStart: [number, number] = [0, 0];

  private tipOffSetup() {
    const place = (s: Side, left: boolean) => s.court.forEach((sp, i) => {
      const e = this.entOf(sp);
      const spots = [[40, 10], [40, 40], [36, 25], [44, 20], [46, 25]];
      const [x, y] = spots[i];
      e.x = e.tx = left ? x : COURT.w - x;
      e.y = e.ty = left ? y : COURT.h - y;
    });
    place(this.H, true);
    place(this.A, false);
  }

  private log(side: 0 | 1 | null, kind: PbpLine['kind'], text: string) {
    this.pbp.push({ period: this.period, clock: this.clock, text, home: this.H.pts, away: this.A.pts, side, kind });
  }

  private applySubs(deadBall: boolean) {
    if (!deadBall) return;
    const total = this.rules.periods * this.rules.periodSec;
    for (const s of [this.H, this.A]) {
      const i = this.sideOf(s);
      const before = new Set(s.court);
      for (const r of this.pendingSubs.filter((x) => x.side === i)) {
        const outIdx = s.court.findIndex((sp) => sp.p.id === r.out);
        const inn = s.roster.find((sp) => sp.p.id === r.in);
        if (outIdx >= 0 && inn && !s.court.includes(inn) && inn.line.pf < this.rules.foulOut && !inn.hurt) s.court[outIdx] = inn;
      }
      if (this.autoSubs[i]) doSubs(s, this.elapsed, total, { period: this.period, clock: this.clock, margin: s === this.H ? this.H.pts - this.A.pts : this.A.pts - this.H.pts }, this.rules);
      else s.court.forEach((sp, k) => { // fouled-out or injured players must leave even with manual subs
        if (sp.line.pf >= this.rules.foulOut || sp.hurt) {
          const rep = s.roster.find((x) => !s.court.includes(x) && x.line.pf < this.rules.foulOut && !x.hurt);
          if (rep) s.court[k] = rep;
        }
      });
      sortCourt(s.court);
      for (const sp of s.court) if (!before.has(sp)) {
        this.addEnt(sp, s, 47, -1);
        const out = [...before].find((x) => !s.court.includes(x));
        this.log(i, 'sub', `${name(sp)} checks in${out ? ` for ${name(out)}` : ''}`);
      }
      for (const sp of before) if (!s.court.includes(sp)) this.ents.delete(sp.p.id);
    }
    this.pendingSubs = [];
  }

  /** Knocks and tweaks on the floor: same per-minute rate as the post-game roll, now it happens mid-game. */
  private rollInjuries(dur: number) {
    for (const s of [this.H, this.A]) for (const sp of s.court) {
      if (sp.hurt || this.rng() >= injuryRatePerMinute(sp.p) * (dur / 60) * (1.6 - sp.energy * 0.6)) continue;
      const inj = rollInjuryType(this.rng);
      sp.hurt = true;
      this.injuries.push({ id: sp.p.id, name: inj.name, days: inj.days });
      this.injuryStop = true;
      this.log(this.sideOf(s), 'info', `${name(sp)} is hurt (${inj.name.toLowerCase()}) and will not return`);
    }
  }

  private nextPossession() {
    const o = this.o!;
    if (!o.keep) this.off = this.other(this.off);
    this.prevKeep = o.keep; this.prevTransition = o.transition; this.prevEvent = o.event;
    this.startPossession();
  }

  private startPossession() {
    if (this.clock <= 0) { this.endPeriod(); return; }
    this.state = 'live';
    const off = this.off, def = this.other(off);
    const resumed = this.forceDead;
    this.forceDead = false;
    const dead = resumed || this.injuryStop || (!this.prevTransition && this.prevEvent !== 'drb' && this.prevEvent !== 'orb');
    this.injuryStop = false;

    // AI timeout when opponent is on a run.
    for (const i of [0, 1] as const) {
      if (i !== this.userSide && dead && this.run[1 - i] >= 8 && this.run[i] <= 2 && this.timeouts[i] > 0) this.pendingTimeout[i] = true;
    }
    if (dead && !resumed && (this.pendingTimeout[0] || this.pendingTimeout[1])) {
      const i = this.pendingTimeout[0] ? 0 : 1;
      this.pendingTimeout[i] = false;
      this.timeouts[i]--;
      this.run = [0, 0];
      this.talkUsed = [false, false];
      for (const s of [this.H, this.A]) s.court.forEach((sp) => (sp.energy = Math.min(1, sp.energy + 0.06)));
      this.log(i, 'info', `Timeout ${this.sideObj(i).team.abbr}`);
      this.state = 'timeout';
      // The other bench uses the stoppage too.
      for (const j of [0, 1] as const) if (j !== this.userSide) this.teamTalk(j, this.currentRun()?.side === 1 - j ? 'fire' : this.rng() < 0.5 ? 'attack' : 'calm');
      return;
    }
    this.applySubs(dead);
    for (const i of [0, 1] as const) {
      if (i !== this.userSide) this.aiIntensity(i);
      const s = this.sideObj(i);
      if (s.boost && --s.boost.left <= 0) s.boost = undefined;
    }
    this.flow.push({ t: this.elapsed, margin: this.H.pts - this.A.pts, wp: this.winProb() });

    const prev = this.o;
    let dur = Math.min(this.clock, possessionLength(off, def, prev ? { ...prev, keep: this.prevKeep, transition: this.prevTransition, event: this.prevEvent } : null, this.rng, this.rules));
    dur = Math.min(this.clock, lateDuration(off, def, dur, this.period, this.rules.periods, this.clock, this.rng));
    const clutch = this.period >= this.rules.periods && this.clock < 120 && Math.abs(this.H.pts - this.A.pts) <= 5;
    const side = this.sideOf(off), defSide = this.sideOf(def);
    const foulNow = this.foulCall[defSide];
    this.foulCall[defSide] = false;
    this.o = decide(off, def, this.rng, this.rules, { transition: this.prevTransition, calledPlay: this.calledPlay[side], clutch, late: { period: this.period, periods: this.rules.periods, clock: this.clock, foulNow } });
    if (this.o.event === 'intentional-foul') dur = Math.min(this.clock, 1 + this.rng() * 2.5);
    this.calledPlay[side] = null;
    this.rollInjuries(dur);
    this.shotClock = this.prevKeep && this.prevEvent !== 'foul' ? 14 : 24;
    this.tPoss = 0;
    this.shotReleased = false;
    this.clockRunning = true;
    this.screens = [];
    this.buildBeats(this.o, dur);
  }

  private buildBeats(o: Outcome, dur: number) {
    const off = this.off, def = this.other(off);
    const beats: Beat[] = [];
    let t = 0;
    const at = (fn: () => void) => beats.push({ at: t, fn });
    const role = (r: Role) => off.court[r - 1] ?? off.court[0];
    const pg = off.court[0];
    const fastBreak = o.events.some((e) => e.k === 'shot' && e.fastBreak);

    // 1) Bring it up.
    const adv = this.prevKeep ? 0.6 : fastBreak ? 1.2 : this.prevTransition ? 2.2 : 3.2 + this.rng() * 1.3;
    at(() => {
      if (this.ball.holder !== pg.p.id && !this.prevKeep) this.passTo(pg, 0.5);
      if (fastBreak) {
        const lanes: Spot[] = [S.rim, S.wingL, S.wingR, S.top, S.deep];
        off.court.forEach((sp, i) => this.targetHalf(off, sp, lanes[i]));
      } else off.court.forEach((sp, i) => this.targetHalf(off, sp, o.play.start[(i + 1) as Role]));
    });
    t += adv;

    // 2) Run the play (scaled to fit the possession).
    // Clock time the finishing events will burn (FTs stop the clock).
    const finishEst = o.events.reduce((x, e) => x + (e.k === 'to' ? 0.8 : e.k === 'foul' ? 1.2 : e.k === 'reb' ? 1.2
      : e.k === 'shot' ? (e.type === 'rim' ? 1.95 : 2.2) : 0), 0);
    const avail = Math.max(0.5, dur - adv - finishEst);
    if (!fastBreak) {
      const total = o.play.steps.reduce((s, x) => s + x.t, 0);
      const passTime = o.play.steps.filter((x) => x.pass).length * 0.45;
      const scale = Math.max(0.35, Math.min(1.3, (avail - passTime) / total));
      at(() => this.log(this.sideOf(off), 'info', `${off.team.abbr} run ${o.play.name}`));
      for (const st of o.play.steps) {
        at(() => {
          for (const [r, sp] of Object.entries(st.move ?? {})) this.targetHalf(off, role(Number(r) as Role), sp!, 0.6);
          this.screens = st.screen ? [[role(st.screen[0]).p.id, role(st.screen[1]).p.id]] : [];
        });
        t += st.t * scale;
        if (st.pass) { const r = st.pass; at(() => this.passTo(role(r))); t += 0.45; }
      }
      const spare = avail - total * scale - passTime;
      if (spare > 0.5) {
        at(() => { this.screens = []; const h = this.holderSp() ?? pg; this.targetHalf(off, h, { x: 27 + this.rng() * 4, y: 15 + this.rng() * 20 }, 2); });
        t += spare;
      }
    }

    // 3) Finish: events.
    for (const ev of o.events) t = this.eventBeats(ev, off, def, t, at, (dt) => (t += dt));
    t += 0.2;
    this.beats = beats;
    this.endAt = t;
  }

  private holderSp(): SP | null {
    for (const s of [this.H, this.A]) for (const sp of s.court) if (sp.p.id === this.ball.holder) return sp;
    return null;
  }

  /** Adds beats for one event; returns the new time cursor. */
  private eventBeats(ev: Ev, off: Side, def: Side, t: number, at: (fn: () => void) => void, adv: (dt: number) => void): number {
    const hoop = this.hoop(off);
    const offSide = this.sideOf(off), defSide = this.sideOf(def);
    let cursor = t;
    const step = (dt: number) => { cursor += dt; adv(dt); };
    switch (ev.k) {
      case 'to': {
        at(() => {
          this.screens = [];
          const text = ev.steal ? `${name(ev.by)} turnover; steal by ${name(ev.steal)}` : `${name(ev.by)} turnover (${this.rng() < 0.5 ? 'bad pass' : 'traveling'})`;
          commitEvent(off, def, ev);
          this.log(offSide, 'to', text);
          if (ev.steal) { const e = this.entOf(ev.steal); this.throwBall(e.x, e.y, 0.3, 0, ev.steal.p.id); }
          else this.clockRunning = false;
        });
        step(0.8);
        break;
      }
      case 'foul': {
        at(() => {
          commitEvent(off, def, ev);
          this.clockRunning = false;
          this.log(defSide, 'foul', `${ev.shooting ? 'Shooting foul' : 'Foul'} on ${name(ev.by)} (${ev.by.line.pf} PF)`);
        });
        step(1.2);
        break;
      }
      case 'ft': {
        if (ev.n === 1) {
          at(() => {
            this.clockRunning = false;
            this.target(ev.by, this.full(off, { x: 19, y: 25 }));
            const others = [...off.court, ...def.court].filter((x) => x !== ev.by);
            others.forEach((sp, i) => this.target(sp, this.full(off, FT_SPOTS[i % FT_SPOTS.length])));
            const e = this.entOf(ev.by); this.throwBall(e.tx, e.ty, 0.5, 0.5, ev.by.p.id);
          });
          step(1.8);
        }
        at(() => {
          const e = this.entOf(ev.by);
          this.throwBall(hoop.x, hoop.y, 0.8, 5, null, () => {
            commitEvent(off, def, ev);
            this.log(offSide, ev.made ? 'score' : 'miss', `${name(ev.by)} ${ev.made ? 'makes' : 'misses'} free throw ${ev.n} of ${ev.of}`);
            if (ev.made) { this.run[offSide] += 1; this.noteScore(offSide, 1); }
          });
          this.ball.x = e.x; this.ball.y = e.y;
        });
        step(ev.n === ev.of ? 1.1 : 1.6);
        break;
      }
      case 'shot': {
        const shooter = ev.by;
        const spot = this.shotSpot(off, shooter, ev.type);
        at(() => {
          this.screens = [];
          if (ev.assist && this.ball.holder !== ev.assist.p.id && this.ball.holder !== shooter.p.id) this.passTo(ev.assist, 0.35);
          this.target(shooter, spot);
        });
        step(ev.type === 'rim' ? 0.9 : 0.6);
        at(() => { if (this.ball.holder !== shooter.p.id) { const e = this.entOf(shooter); this.throwBall(e.tx, e.ty, 0.4, 1, shooter.p.id); } });
        step(0.45);
        at(() => {
          this.shotReleased = true;
          const e = this.entOf(shooter);
          this.ball.x = e.x; this.ball.y = e.y;
          const feet = Math.round(dist(e.tx, e.ty, hoop.x, hoop.y));
          const dur = ev.type === 'rim' ? 0.5 : ev.type === 'mid' ? 0.9 : 1.1;
          const tx = ev.block ? hoop.x + (this.rng() - 0.5) * 12 : hoop.x;
          const ty = ev.block ? hoop.y + (this.rng() - 0.5) * 14 : hoop.y;
          const sx = e.tx, sy = e.ty; // the spot the shot type was drawn for
          this.throwBall(tx, ty, ev.block ? 0.4 : dur, ev.type === 'rim' ? 2 : 6, null, () => {
            commitEvent(off, def, ev);
            this.shotReleased = false;
            this.noteShot(off, shooter, ev, sx, sy);
            if (ev.made) this.noteScore(offSide, ev.type === 'three' ? 3 : 2);
            const what = ev.type === 'three' ? `${feet}-ft three` : ev.type === 'mid' ? `${feet}-ft jumper` : ev.fastBreak ? 'fast-break layup' : shooter.p.ratings.attrs.dunk > 75 && this.rng() < 0.5 ? 'dunk' : 'layup';
            if (ev.made) {
              this.run[offSide] += ev.type === 'three' ? 3 : 2;
              this.log(offSide, 'score', `${name(shooter)} makes ${what}${ev.assist ? ` (${name(ev.assist)} assists)` : ''}`);
            } else this.log(offSide, 'miss', `${name(shooter)} misses ${what}${ev.block ? ` — blocked by ${name(ev.block)}` : ''}`);
          });
        });
        step(ev.type === 'rim' ? 0.6 : 1.15);
        break;
      }
      case 'reb': {
        at(() => {
          // Crash: bigs to the rim, guards get back.
          for (const s of [off, def]) s.court.forEach((sp, i) => {
            const toRim = i >= 2 || s === def;
            if (toRim) this.target(sp, { x: hoop.x + (hoop.x > 47 ? -1 : 1) * (4 + this.rng() * 6), y: hoop.y + (this.rng() - 0.5) * 14 });
          });
        });
        step(0.7);
        at(() => {
          commitEvent(off, def, ev);
          const who = ev.by ?? def.court[def.court.length - 1];
          const e = this.entOf(who);
          this.throwBall(e.x, e.y, 0.3, 0.5, who.p.id);
          this.log(ev.off ? offSide : defSide, 'reb', ev.by ? `${ev.off ? 'Offensive' : 'Defensive'} rebound ${name(ev.by)}` : `${def.team.abbr} team rebound`);
        });
        step(0.5);
        break;
      }
    }
    return cursor;
  }

  private shotSpot(off: Side, sp: SP, type: ShotType): Spot {
    const e = this.entOf(sp);
    const hoop = this.hoop(off);
    const ang = Math.atan2(e.y - hoop.y, e.x - hoop.x);
    const r = type === 'rim' ? 2 + this.rng() * 3 : type === 'mid' ? 11 + this.rng() * 7 : 24 + this.rng() * 2;
    const p = { x: hoop.x + Math.cos(ang) * r, y: hoop.y + Math.sin(ang) * r };
    if (type === 'three' && (p.y < 3 || p.y > 47)) p.y = p.y < 25 ? 2.5 : 47.5; // corner
    p.x = Math.min(COURT.w - 1, Math.max(1, p.x));
    p.y = Math.min(COURT.h - 1, Math.max(1, p.y));
    return p;
  }

  private endPeriod() {
    this.beats = [];
    this.flight = null;
    this.periodScores.push([this.H.pts - this.periodStart[0], this.A.pts - this.periodStart[1]]);
    this.periodStart = [this.H.pts, this.A.pts];
    const regEnd = this.period >= this.rules.periods;
    if (regEnd && this.H.pts !== this.A.pts) {
      this.state = 'final';
      this.flow.push({ t: this.elapsed, margin: this.H.pts - this.A.pts, wp: this.winProb() });
      this.log(null, 'info', `Final: ${this.H.team.abbr} ${this.H.pts} – ${this.A.team.abbr} ${this.A.pts}`);
      return;
    }
    this.log(null, 'info', `End of ${this.period <= 4 ? `Q${this.period}` : `OT${this.period - 4}`}`);
    this.period++;
    this.clock = this.period <= this.rules.periods ? this.rules.periodSec : this.rules.otSec;
    this.H.fouls = this.A.fouls = 0;
    if (this.period === 3) this.timeouts = this.fiba ? [3, 3] : [Math.min(this.timeouts[0], 4), Math.min(this.timeouts[1], 4)];
    for (const s of [this.H, this.A]) s.roster.forEach((sp) => (sp.energy = Math.min(1, sp.energy + (this.period === 3 ? 0.35 : 0.18))));
    // Q2/Q3 to tip loser, Q4 to tip winner; OT alternates from Q4.
    const loser = this.tipWinner === this.H ? this.A : this.H;
    this.off = this.period === 2 || this.period === 3 ? loser : this.period % 2 === 0 ? this.tipWinner : loser;
    this.o = null; this.prevKeep = false; this.prevTransition = false; this.prevEvent = 'period';
    const pg = this.off.court[0];
    const e = this.entOf(pg);
    this.ball = { x: e.x, y: e.y, z: 3, holder: pg.p.id };
    this.state = 'break';
  }
}

/** Standard normal CDF (Abramowitz–Stegun erf approximation). */
function normCdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const k = 1 / (1 + 0.3275911 * z);
  const erf = 1 - (((((1.061405429 * k - 1.453152027) * k) + 1.421413741) * k - 0.284496736) * k + 0.254829592) * k * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}
