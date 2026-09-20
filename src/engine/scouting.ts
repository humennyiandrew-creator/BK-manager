// Scouting: assignments on regions/colleges/prospects/opponents, knowledge accumulation, shortlist.
import type { GameState, Player, ScoutAssignment, ScoutTargetKind } from './model';
import { hashString, mulberry32, type Rng } from './rng';
import { daysBetween } from './schedule';
import { staffRating } from './mgmt/staff';
import { scoutView } from './draft';
import { opponentReport } from './prep';

function weeklyTick(s: GameState): boolean {
  const d = daysBetween(`${s.seasonYear}-10-01`, s.date);
  return d > 0 && d % 7 === 0;
}

function msg(s: GameState, subject: string, body: string, kind: 'draft' | 'other' = 'draft') {
  s.messages.unshift({ id: s.nextId++, date: s.date, from: 'Scouting Department', subject, body, read: false, kind });
}

export const SCOUT_REGIONS = ['USA West', 'USA East', 'Europe', 'Africa', 'Oceania', 'South America'];
const EUROPE = new Set(['Serbia', 'France', 'Spain', 'Lithuania', 'Germany', 'Ukraine', 'Turkey', 'Greece']);
const AFRICA = new Set(['Nigeria']);
const OCEANIA = new Set(['Australia']);

function inRegion(p: Player, region: string): boolean {
  if (region === 'USA West') return p.country === 'USA' && hashString(p.id) % 2 === 0;
  if (region === 'USA East') return p.country === 'USA' && hashString(p.id) % 2 === 1;
  if (region === 'Europe') return EUROPE.has(p.country);
  if (region === 'Africa') return AFRICA.has(p.country);
  if (region === 'Oceania') return OCEANIA.has(p.country);
  return false; // South America: no current pool
}

export function matchingProspects(s: GameState, kind: ScoutTargetKind, key: string): string[] {
  if (kind === 'player') return s.draftClass.includes(key) ? [key] : [];
  if (kind === 'opponent') return [];
  if (kind === 'region') return s.draftClass.filter((id) => inRegion(s.players[id], key));
  if (kind === 'college') return s.draftClass.filter((id) => s.players[id].college === key);
  return [];
}

export function availableColleges(s: GameState): string[] {
  return Array.from(new Set(s.draftClass.map((id) => s.players[id].college).filter((x): x is string => !!x))).sort();
}

const WEEKLY_COST: Record<ScoutTargetKind, number> = { region: 220_000, opponent: 160_000, college: 110_000, player: 70_000 };

export function startAssignment(s: GameState, kind: ScoutTargetKind, key: string, weeks: number): string | null {
  const teamId = s.userTeamId;
  const scoutCount = s.staff.filter((x) => x.teamId === teamId && x.role === 'scout').length;
  if (scoutCount < 1) return 'No scout on staff to run this assignment';
  if (s.scouting.assignments.length >= scoutCount) return 'All scouts are already assigned';
  const w = Math.max(2, Math.min(8, Math.round(weeks)));
  const cost = WEEKLY_COST[kind];
  if (s.finance.cash < cost) return 'Not enough cash to fund this assignment';

  let label = key;
  if (kind === 'player') {
    const p = s.players[key];
    if (!p) return 'Prospect not found';
    label = `${p.firstName} ${p.lastName}`;
  } else if (kind === 'opponent') {
    const t = s.teams[key];
    if (!t) return 'Team not found';
    label = `${t.city} ${t.name}`;
  }

  s.scouting.assignments.push({ id: s.nextId++, staffId: null, kind, key, label, weeksLeft: w, weeksTotal: w, cost });
  return null;
}

export function cancelAssignment(s: GameState, id: number): void {
  s.scouting.assignments = s.scouting.assignments.filter((x) => x.id !== id);
}

export function addToShortlist(s: GameState, pid: string): void {
  if (!s.scouting.shortlist.includes(pid) && s.scouting.shortlist.length < 20) s.scouting.shortlist.push(pid);
}

export function removeFromShortlist(s: GameState, pid: string): void {
  s.scouting.shortlist = s.scouting.shortlist.filter((x) => x !== pid);
}

function findHiddenGem(s: GameState, pool: string[], rng: Rng): string | null {
  const idx = new Map(s.draftClass.map((id, i) => [id, i]));
  const cands = pool.filter((id) => (s.players[id].ratings.pot >= 85) && (idx.get(id) ?? 0) >= 20);
  if (!cands.length || rng() >= 0.35) return null;
  return cands[Math.floor(rng() * cands.length)];
}

function completeAssignment(s: GameState, a: ScoutAssignment, pool: string[], rng: Rng): void {
  if (a.kind === 'opponent') {
    const r = opponentReport(s, a.key);
    const star = s.players[r.star];
    const starTxt = star ? `${star.firstName} ${star.lastName}` : 'unclear';
    msg(s, `Scouting report: ${a.label}`,
      `Pace ${r.pace}, 3PT rate ${Math.round(r.threeRate * 100)}%, rim rate ${Math.round(r.rimRate * 100)}%. Star: ${starTxt}. Scheme: ${r.scheme}. Weakness: ${r.weakness}.`,
      'other');
    return;
  }
  if (!pool.length) {
    msg(s, `${a.label} scouting complete`, 'No matching prospects found in this class.');
    return;
  }
  const standouts = pool
    .map((id) => ({ id, v: scoutView(s, id, s.userTeamId) }))
    .sort((x, y) => y.v.pot - x.v.pot)
    .slice(0, 3);
  const lines = standouts.map(({ id, v }) => {
    const p = s.players[id];
    return `${p.firstName} ${p.lastName} (${p.positions[0]}) — OVR ${v.ovr}±${v.range}, POT ${v.pot}±${v.range}`;
  });
  const gem = findHiddenGem(s, pool, rng);
  if (gem) {
    s.scouting.knowledge[gem] = Math.min(1, (s.scouting.knowledge[gem] ?? 0) + 0.5);
    const gp = s.players[gem];
    lines.push(`Hidden gem spotted: ${gp.firstName} ${gp.lastName} may be far better than his reputation suggests.`);
  }
  msg(s, `${a.label} scouting complete`, lines.join(' '));
}

/** Weekly (same cadence as progression): tick assignments, raise knowledge, charge cash. */
export function scoutingWeekly(s: GameState): void {
  if (!weeklyTick(s)) return;
  const teamId = s.userTeamId;
  const rng = mulberry32(hashString(`${s.seed}|scoutwk|${s.date}`));
  const scoutSkill = staffRating(s, teamId, 'scout') / 100;
  const analyticsSkill = staffRating(s, teamId, 'analytics') / 100;
  const gainRate = 0.15 + 0.2 * (0.7 * scoutSkill + 0.3 * analyticsSkill);

  for (const a of [...s.scouting.assignments]) {
    if (s.finance.cash >= a.cost) {
      s.finance.cash -= a.cost;
      s.finance.expense.operations += a.cost;
    }
    a.weeksLeft -= 1;

    const pool = matchingProspects(s, a.kind, a.key);
    for (const pid of pool) {
      const cur = s.scouting.knowledge[pid] ?? 0;
      s.scouting.knowledge[pid] = Math.min(1, cur + gainRate);
    }

    if (a.weeksLeft <= 0) {
      completeAssignment(s, a, pool, rng);
      s.scouting.assignments = s.scouting.assignments.filter((x) => x.id !== a.id);
    }
  }
}
