// Season arcs: the rare player who comes out of nowhere to have a career year — or whose season
// completely falls apart. Rolled once per season, hidden at first, ramped in week by week so the
// numbers tell the story before the headlines do, then partly kept (or recovered) over the summer.
import type { ArcKind, ArcStyle, GameEvent, GameState, Player, SeasonArc } from './model';
import { ageOf, type Attr } from './ratings';
import { gauss, hashString, mulberry32, type Rng } from './rng';
import { pushNews } from './news';
import { clamp } from './mgmt/market';

const fullName = (p: Player) => `${p.firstName} ${p.lastName}`;

const SKILL: Attr[] = ['closeShot', 'layup', 'postScoring', 'midRange', 'threePoint', 'freeThrow', 'ballHandle', 'passing', 'vision', 'offIQ', 'perimeterD', 'interiorD', 'helpD', 'steal', 'block', 'offRebound', 'defRebound'];

/** Attributes each kind of arc moves — the leap (or the slide) shows up where it should in the sim. */
export const ARC_POOLS: Record<ArcStyle, Attr[]> = {
  shooter: ['threePoint', 'midRange', 'freeThrow', 'offIQ', 'clutch'],
  creator: ['ballHandle', 'passing', 'vision', 'offIQ', 'drawFoul'],
  athlete: ['speed', 'acceleration', 'vertical', 'strength', 'dunk', 'layup', 'stamina'],
  stopper: ['perimeterD', 'helpD', 'interiorD', 'steal', 'block', 'defRebound'],
  scorer: ['closeShot', 'layup', 'midRange', 'postScoring', 'drawFoul', 'threePoint'],
  allround: SKILL,
  confidence: ['threePoint', 'midRange', 'freeThrow', 'closeShot', 'clutch', 'offIQ'],
  body: ['speed', 'acceleration', 'vertical', 'stamina', 'perimeterD', 'layup', 'dunk'],
  nagging: ['durability', 'stamina', 'speed', 'vertical', 'acceleration', 'strength'],
  focus: ['offIQ', 'helpD', 'passing', 'vision', 'perimeterD', 'ballHandle'],
};

export const ARC_LABEL: Record<ArcStyle, string> = {
  shooter: 'Found his stroke', creator: 'Playmaking leap', athlete: 'Athletic leap', stopper: 'Lockdown leap',
  scorer: 'Scoring leap', allround: 'Complete breakout',
  confidence: 'Lost his touch', body: 'Lost a step', nagging: 'Nagging injuries', focus: 'Lost focus',
};

const ARC_BLURB: Record<ArcStyle, string> = {
  shooter: 'his jumper has been transformed',
  creator: 'he has taken over as a playmaker',
  athlete: 'a summer of work has made him a different athlete',
  stopper: 'he has become one of the toughest defenders around',
  scorer: 'he has turned into a go-to scorer',
  allround: 'every part of his game has taken a leap',
  confidence: 'his shot has deserted him and the confidence has gone with it',
  body: 'he has lost a step and opponents are attacking him',
  nagging: 'nagging injuries have sapped his explosiveness',
  focus: 'off-court distractions have him looking lost on the floor',
};

const BREAKOUTS: ArcStyle[] = ['shooter', 'creator', 'athlete', 'stopper', 'scorer', 'allround'];
export const isBreakoutStyle = (st: ArcStyle) => BREAKOUTS.includes(st);

/** Per-season chance of each arc. Young players are likelier to leap, veterans to fall off a cliff — but either can happen to anyone. */
export function arcOdds(p: Player, age: number): { breakout: number; collapse: number } {
  const b = age <= 21 ? 0.028 : age <= 24 ? 0.024 : age <= 27 ? 0.016 : age <= 30 ? 0.01 : age <= 33 ? 0.0065 : 0.0035;
  const c = age <= 21 ? 0.01 : age <= 24 ? 0.011 : age <= 27 ? 0.012 : age <= 30 ? 0.016 : age <= 33 ? 0.024 : 0.032;
  const { workEthic, temperament } = p.ratings.personality;
  const work = workEthic / 20;
  return {
    breakout: b * (0.7 + work * 0.6) * (p.ratings.ovr >= 90 ? 0.4 : 1),
    collapse: c * (1.3 - work * 0.6) * (temperament <= 6 ? 1.15 : 1) * (0.8 + p.ratings.injuryProne * 0.6),
  };
}

function weighted<T>(items: [T, number][], rng: Rng): T {
  let r = rng() * items.reduce((s, [, w]) => s + w, 0);
  for (const [it, w] of items) if ((r -= w) <= 0) return it;
  return items[items.length - 1][0];
}

function pickStyle(p: Player, kind: ArcKind, age: number, rng: Rng): ArcStyle {
  const a = p.ratings.attrs, t = p.ratings.tend, pos = p.positions[0];
  const guard = pos === 'PG' || pos === 'SG';
  if (kind === 'breakout') return weighted<ArcStyle>([
    ['shooter', 1 + t.threeRate * 3 + (guard ? 0.5 : 0)],
    ['creator', 0.6 + (pos === 'PG' ? 1.5 : guard ? 0.6 : 0) + Math.max(0, a.passing - 60) / 20],
    ['athlete', 0.4 + (age <= 23 ? 1.4 : age <= 26 ? 0.5 : 0)],
    ['stopper', 0.8 + Math.max(0, (a.perimeterD + a.helpD) / 2 - 58) / 15],
    ['scorer', 0.8 + t.usage * 4],
    ['allround', 1],
  ], rng);
  const { temperament, ego } = p.ratings.personality;
  return weighted<ArcStyle>([
    ['confidence', 1 + t.threeRate * 2],
    ['body', 0.3 + Math.max(0, age - 28) * 0.5],
    ['nagging', 0.4 + p.ratings.injuryProne * 2],
    ['focus', 0.5 + (temperament <= 8 ? 1 : 0) + (ego >= 15 ? 0.6 : 0)],
  ], rng);
}

function rollMagnitude(p: Player, kind: ArcKind, age: number, rng: Rng): number {
  const ovr = p.ratings.ovr;
  if (kind === 'breakout') {
    // Bench players have the most room: "out of nowhere" leaps are the biggest.
    let m = 4 + Math.abs(gauss(rng)) * 2.5 + Math.max(0, 74 - ovr) * 0.15;
    if (age <= 24 && rng() < 0.12) m += 3; // the rare superstar leap
    if (ovr >= 86) m *= 0.6;
    return Math.round(clamp(Math.min(m, 97 - ovr), 2, 13));
  }
  let m = 4 + Math.abs(gauss(rng)) * 2.2 + (age >= 32 ? 1.5 : 0);
  if (ovr >= 88) m *= 0.75; // stars stumble, they rarely fall off the map
  return -Math.round(clamp(Math.min(m, ovr - 40), 2, 11));
}

/** Roll this season's arcs for every rostered player (called when a season starts). */
export function rollSeasonArcs(s: GameState) {
  for (const p of Object.values(s.players)) {
    if (p.retired || p.prospect || !p.teamId) { p.ovrTrack = undefined; continue; }
    p.ovrTrack = [p.ratings.ovr];
    if (p.arc?.season === s.season) continue;
    p.arc = undefined;
    const rng = mulberry32(hashString(`${s.seed}|arc|${s.season}|${p.id}`));
    const age = ageOf(p.birthDate, new Date(`${s.seasonYear}-10-01`));
    const odds = arcOdds(p, age);
    const r = rng();
    const kind: ArcKind | null = r < odds.breakout ? 'breakout' : r < odds.breakout + odds.collapse ? 'collapse' : null;
    if (!kind) continue;
    p.arc = {
      season: s.season, kind, style: pickStyle(p, kind, age, rng), magnitude: rollMagnitude(p, kind, age, rng),
      startWeek: 2 + Math.floor(rng() * 11), rampWeeks: 6 + Math.floor(rng() * 8), applied: 0,
    };
  }
}

/** 0→1 smoothstep progress of an arc at a given progression week. */
export function arcProgress(arc: SeasonArc, week: number): number {
  const t = (week - arc.startWeek) / arc.rampWeeks;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/** Moves OVR by `delta` (clamped) and the arc's attributes with it. Returns the OVR change applied. */
function shiftArc(p: Player, delta: number, style: ArcStyle, rng: Rng): number {
  const r = p.ratings;
  const next = clamp(r.ovr + delta, 35, 99);
  const d = next - r.ovr;
  if (!d) return 0;
  r.ovr = next;
  if (r.ovr > r.pot) r.pot = r.ovr;
  const pool = ARC_POOLS[style];
  const rate = style === 'allround' ? 1 : 2.2; // concentrated arcs move fewer attributes further
  for (let i = 0; i < Math.abs(d); i++) {
    for (const k of pool) r.attrs[k] = Math.round(clamp(r.attrs[k] + Math.sign(d) * rate * (0.6 + rng() * 0.8), 25, 99));
  }
  if (style === 'nagging' && d < 0) r.injuryProne = clamp(r.injuryProne + 0.02 * -d, 0.05, 0.95);
  return d;
}

/** Weekly tick: ramp the arc toward its target. Returns this week's OVR change. */
export function tickArc(s: GameState, p: Player, week: number): number {
  const arc = p.arc;
  if (!arc || arc.season !== s.season) return 0;
  const want = Math.round(arc.magnitude * arcProgress(arc, week));
  const step = want - arc.applied;
  if (!step || Math.sign(step) !== Math.sign(arc.magnitude)) return 0;
  const rng = mulberry32(hashString(`${s.seed}|arctick|${p.id}|${week}`));
  const d = shiftArc(p, step, arc.style, rng);
  arc.applied += d;
  if (!arc.revealed && Math.abs(arc.applied) >= (p.teamId === s.userTeamId ? 2 : 3)) revealArc(s, p, arc);
  return d;
}

/** True while an arc is actively moving a player this season (normal growth/decline pauses meanwhile). */
export function arcActive(p: Player, season: string, week: number): boolean {
  const a = p.arc;
  return !!a && a.season === season && !a.locked && week >= a.startWeek;
}

function revealArc(s: GameState, p: Player, arc: SeasonArc) {
  arc.revealed = true;
  const mine = p.teamId === s.userTeamId;
  if (!mine && p.ratings.ovr < 72 && Math.abs(arc.magnitude) < 7) return; // quiet ones stay quiet
  const abbr = p.teamId ? s.teams[p.teamId].abbr : 'FA';
  const up = arc.kind === 'breakout';
  pushNews(s, {
    kind: up ? 'breakout' : 'slump', tone: up ? 'good' : 'bad', teamId: p.teamId ?? undefined, playerId: p.id,
    headline: up ? `Breakout watch: ${fullName(p)} (${abbr})` : `${fullName(p)}'s season is unravelling`,
    body: `${up ? 'Nobody saw this coming' : 'A rough few weeks have become a crisis'} — ${ARC_BLURB[arc.style]}. ${up ? 'Up' : 'Down'} ${Math.abs(arc.applied)} OVR since opening night.`,
  });
}

/** Arc slated for the user's decision: revealed, this season, not yet handled. */
export function pendingArcDecision(s: GameState): Player | undefined {
  return Object.values(s.players).find((p) => p.teamId === s.userTeamId && p.arc?.revealed && !p.arc.eventDone && p.arc.season === s.season);
}

type ArcDraft = Pick<GameEvent, 'type' | 'title' | 'body' | 'playerId' | 'choices'>;

const specialistCost = (s: GameState) => ((s.teams[s.userTeamId].league ?? 'NBA') === 'NBA' ? 350_000 : 120_000);

export function arcEventDraft(s: GameState, p: Player): ArcDraft {
  const arc = p.arc!;
  arc.eventDone = true;
  if (arc.kind === 'breakout') return {
    type: 'arc-breakout', playerId: p.id,
    title: `${fullName(p)} is having a breakout season`,
    body: `${ARC_LABEL[arc.style]}: ${ARC_BLURB[arc.style]}. He's up ${arc.applied} OVR already and the league is starting to notice. How do we handle it?`,
    choices: [
      { id: 'feature', label: 'Feature him — more touches', hint: 'Morale up and a bigger usage share; the extra reps can push the leap further. Big egos in the room may resent it.' },
      { id: 'grounded', label: 'Keep him grounded', hint: 'No hype, no shortcuts — more of this leap is likely to stick next season.' },
      { id: 'hype', label: 'Sell the story to the media', hint: 'Fan hype and his morale rise, but the spotlight makes it harder to sustain.' },
    ],
  };
  return {
    type: 'arc-slump', playerId: p.id,
    title: `${fullName(p)} is in a deep slump`,
    body: `${ARC_LABEL[arc.style]}: ${ARC_BLURB[arc.style]}. He's down ${Math.abs(arc.applied)} OVR and it may get worse. What's the plan?`,
    choices: [
      { id: 'faith', label: 'Keep faith — let him play through it', hint: 'Morale rises. He might snap out of it… or sink deeper.' },
      { id: 'specialist', label: 'Bring in a specialist', hint: `Costs $${(specialistCost(s) / 1e3).toFixed(0)}K. Good chance to stop the slide and speed his recovery — less effective when his body is the problem.` },
      { id: 'bench', label: 'Lower the pressure, reduce his role', hint: 'His morale drops, but the slide stops here and he resets over the summer.' },
    ],
  };
}

const freeze = (arc: SeasonArc) => { arc.locked = true; arc.magnitude = arc.applied; };

/** Applies a user decision on an arc event. Returns the outcome text. */
export function applyArcChoice(s: GameState, ev: GameEvent, choiceId: string): string {
  const p = ev.playerId ? s.players[ev.playerId] : undefined;
  const arc = p?.arc;
  if (!p || !arc) return 'No change.';
  const rng = mulberry32(hashString(`${s.seed}|arcev|${ev.id}`));
  const name = fullName(p);
  if (ev.type === 'arc-breakout') {
    if (choiceId === 'feature') {
      p.morale = clamp(p.morale + 6, 0, 100);
      p.ratings.tend.usage = Math.min(0.38, p.ratings.tend.usage + 0.025);
      if (!arc.locked) arc.magnitude = Math.min(arc.magnitude + 1 + (rng() < 0.5 ? 1 : 0), 99 - p.ratings.ovr + arc.applied);
      const jealous = Object.values(s.players).filter((x) => x.teamId === s.userTeamId && x.id !== p.id && x.ratings.personality.ego >= 15 && x.ratings.ovr >= p.ratings.ovr - 3);
      for (const x of jealous) x.morale = clamp(x.morale - 4, 0, 100);
      return `${name} is now a featured option.${jealous.length ? ` ${jealous.map((x) => x.lastName).join(', ')} ${jealous.length === 1 ? 'isn\'t' : 'aren\'t'} thrilled about sharing the ball.` : ''}`;
    }
    if (choiceId === 'hype') {
      p.morale = clamp(p.morale + 4, 0, 100);
      s.finance.hype = clamp((s.finance.hype ?? 50) + 5, 0, 100);
      arc.keep = (arc.keep ?? 0) - 0.1;
      return `${name} is everywhere this week. The fans love it — the pressure to keep it up is real.`;
    }
    arc.keep = (arc.keep ?? 0) + 0.2;
    p.morale = clamp(p.morale - 1, 0, 100);
    return `We kept the focus on the work. ${name}'s leap looks built to last.`;
  }
  // slump
  if (choiceId === 'specialist') {
    const cost = specialistCost(s);
    s.finance.cash -= cost;
    s.finance.expense.operations += cost;
    const odds = arc.style === 'body' ? 0.35 : arc.style === 'nagging' ? 0.5 : 0.65;
    if (rng() < odds) {
      freeze(arc);
      arc.keep = (arc.keep ?? 0) - 0.25;
      p.morale = clamp(p.morale + 3, 0, 100);
      return `The specialist got through to ${name}. The slide has stopped and he should bounce back well.`;
    }
    return `The sessions didn't take. ${name} is still struggling.`;
  }
  if (choiceId === 'bench') {
    freeze(arc);
    arc.keep = (arc.keep ?? 0) - 0.2;
    p.morale = clamp(p.morale - 8, 0, 100);
    return `${name} is out of the spotlight for now. He's not happy, but the slide has stopped.`;
  }
  p.morale = clamp(p.morale + 6, 0, 100);
  const r = rng();
  if (r < 0.35) {
    freeze(arc);
    arc.keep = (arc.keep ?? 0) - 0.3;
    return `${name} repaid the faith — he's snapped out of it.`;
  }
  if (r > 0.75 && !arc.locked) {
    arc.magnitude = Math.max(arc.magnitude - 2, 40 - p.ratings.ovr + arc.applied);
    return `We stuck with ${name}, but it's getting worse.`;
  }
  return `${name} appreciates the backing. Too early to say if it's working.`;
}

/** End of season: land the rest of the arc, then decide how much of it survives the summer. */
export function settleArc(s: GameState, p: Player) {
  const arc = p.arc;
  if (!arc) return;
  p.arc = undefined;
  if (arc.season !== s.season) return;
  const rng = mulberry32(hashString(`${s.seed}|arcsettle|${s.season}|${p.id}`));
  const age = ageOf(p.birthDate, new Date(`${s.seasonYear + 1}-07-01`));
  const rest = arc.locked ? 0 : arc.magnitude - arc.applied;
  if (rest && Math.sign(rest) === Math.sign(arc.magnitude)) arc.applied += shiftArc(p, rest, arc.style, rng);
  let keep: number;
  if (arc.kind === 'breakout') keep = age <= 24 ? 1 : age <= 28 ? 0.85 : age <= 31 ? 0.7 : 0.5;
  else keep = 1 - (age <= 24 ? (rng() < 0.3 ? 0.15 : 0.6) : age <= 29 ? 0.45 : age <= 32 ? 0.25 : 0.1);
  keep = clamp(keep + (arc.keep ?? 0), 0, 1);
  const back = -Math.round(arc.applied * (1 - keep));
  const net = arc.applied + (back ? shiftArc(p, back, arc.style, rng) : 0);
  if (arc.kind === 'breakout' && age <= 25) p.ratings.pot = Math.min(99, Math.max(p.ratings.pot, p.ratings.ovr + 2 + Math.round(rng() * 3)));
  if (arc.kind === 'collapse' && keep >= 0.8 && age <= 25) p.ratings.pot = Math.max(p.ratings.ovr, p.ratings.pot - 3 - Math.round(rng() * 3));
  if (arc.applied) {
    p.arcHistory = [...(p.arcHistory ?? []), { season: arc.season, kind: arc.kind, style: arc.style, delta: arc.applied, kept: net }].slice(-6);
  }
}
