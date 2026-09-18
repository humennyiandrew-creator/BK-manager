// Draft: picks, generated classes, scouting fog, lottery, selections.
import type { DraftPick, GameState, Player } from './model';
import { contractRows, minSalary, rookieScale } from './cba';
import { gauss, hashString, mulberry32 } from './rng';
import { genPlayer } from './gen';
import { staffRating } from './mgmt/staff';
import { facilityLevel } from './mgmt/facilities';
import { standings } from './season';
import { refreshRotation } from './rotation';

const PICK_YEARS = 5;

export function initPicks(s: GameState) {
  for (let y = s.seasonYear + 1; y <= s.seasonYear + PICK_YEARS; y++) addPickYear(s, y);
  generateDraftClass(s, s.seasonYear + 1);
}

export function addPickYear(s: GameState, year: number) {
  for (const t of Object.keys(s.teams)) for (const round of [1, 2] as const) {
    s.picks.push({ id: `${year}-${round}-${s.teams[t].abbr}`, year, round, original: t, owner: t });
  }
}

export function generateDraftClass(s: GameState, year: number) {
  const rng = mulberry32(hashString(`${s.seed}|class|${year}`));
  const ids: string[] = [];
  for (let i = 0; i < 70; i++) {
    const age = 19 + Math.floor(rng() * 4);
    const pot = Math.round(Math.min(97, Math.max(58, 91 - i * 0.38 + gauss(rng) * 4 - (age - 19) * 1.5)));
    const ovr = Math.round(Math.min(pot, Math.max(50, 67 - i * 0.14 + gauss(rng) * 3 + (age - 19) * 1.2)));
    const id = `gen-${year}-${i}`;
    s.players[id] = genPlayer({ id, ovr, pot, age, asOf: `${year}-06-24`, rng });
    ids.push(id);
  }
  s.draftClass = ids;
}

/** Fog of war: what `teamId`'s scouts think a prospect is. Deterministic per (team, player). */
export function scoutView(s: GameState, pid: string, teamId: string): { ovr: number; pot: number; range: number } {
  const p = s.players[pid];
  const skill = staffRating(s, teamId, 'scout') / 100 * 0.7 + facilityLevel(s, teamId, 'scouting') / 5 * 0.3;
  const range = Math.round(2 + (1 - skill) * 10);
  const rng = mulberry32(hashString(`${s.seed}|scout|${teamId}|${pid}`));
  const noise = (rng() - 0.5) * 2 * range;
  return { ovr: Math.round(p.ratings.ovr + noise * 0.4), pot: Math.round(p.ratings.pot + noise), range };
}

// ---------- order ----------

const ODDS = [140, 140, 140, 125, 105, 90, 75, 60, 45, 30, 20, 15, 10, 5]; // per 1000, 2019 format

/** Run after the season: lottery for the 14 non-playoff teams, rest by record. Sets s.draftOrder. */
export function runLottery(s: GameState): string[] {
  const year = s.seasonYear + 1;
  const rng = mulberry32(hashString(`${s.seed}|lottery|${year}`));
  const table = standings(s).reverse(); // worst first
  const playoffTeams = new Set(s.series.filter((x) => x.kind === 'playoff' && x.round === 1).flatMap((x) => [x.high, x.low]));
  const lotteryTeams = table.filter((r) => !playoffTeams.has(r.teamId)).map((r) => r.teamId).slice(0, 14);
  const rest = table.filter((r) => !lotteryTeams.includes(r.teamId)).map((r) => r.teamId);

  const drawn: string[] = [];
  for (let k = 0; k < 4; k++) {
    const left = lotteryTeams.map((t, i) => [t, ODDS[i]] as const).filter(([t]) => !drawn.includes(t));
    let r = rng() * left.reduce((x, [, w]) => x + w, 0);
    drawn.push(left.find(([, w]) => (r -= w) <= 0)?.[0] ?? left[0][0]);
  }
  const order1 = [...drawn, ...lotteryTeams.filter((t) => !drawn.includes(t)), ...rest];
  const order2 = [...lotteryTeams, ...rest];
  const pickFor = (orig: string, round: 1 | 2) => s.picks.find((p) => p.year === year && p.round === round && p.original === orig)!;
  s.draftOrder = [...order1.map((t) => pickFor(t, 1).id), ...order2.map((t) => pickFor(t, 2).id)];
  const top = drawn.map((t, i) => `${i + 1}. ${s.teams[t].abbr}`).join(', ');
  s.messages.unshift({ id: s.nextId++, date: s.date, from: 'League Office', subject: `${year} Draft Lottery results`, body: `Top four: ${top}.`, read: false, kind: 'draft' });
  return s.draftOrder;
}

export const nextPick = (s: GameState): DraftPick | undefined => {
  const id = s.draftOrder.find((pid) => s.picks.some((p) => p.id === pid));
  return id ? s.picks.find((p) => p.id === id) : undefined;
};

export function makePick(s: GameState, pickId: string, playerId: string): string | null {
  const pick = s.picks.find((p) => p.id === pickId);
  const p: Player | undefined = s.players[playerId];
  if (!pick || !p?.prospect) return 'Invalid pick';
  const slot = s.draftOrder.indexOf(pickId) + 1;
  const year = pick.year;
  p.prospect = false;
  p.teamId = pick.owner;
  p.draft = { year, round: pick.round, pick: slot };
  p.contract = pick.round === 1
    ? { salaries: rookieScale(slot, year).salaries, type: 'rookie', option: { season: rookieScale(slot, year).salaries[2].season, kind: 'team' } }
    : { salaries: contractRows(year, minSalary(year, 0), 2), type: 'min' };
  s.picks = s.picks.filter((x) => x.id !== pickId);
  s.draftClass = s.draftClass.filter((x) => x !== playerId);
  refreshRotation(s.teams[pick.owner], s.players);
  const text = `Pick ${slot}: ${s.teams[pick.owner].abbr} select ${p.firstName} ${p.lastName} (${p.positions[0]}, ${p.college})`;
  s.transactions.unshift({ date: s.date, kind: 'draft', text, teams: [pick.owner] });
  return null;
}

/** AI selects best available by its own scouting, with a small positional-need nudge. */
export function aiPick(s: GameState, pickId: string) {
  const pick = s.picks.find((p) => p.id === pickId)!;
  const have = new Set(Object.values(s.players).filter((p) => p.teamId === pick.owner).map((p) => p.positions[0]));
  const best = s.draftClass
    .map((id) => { const v = scoutView(s, id, pick.owner); return { id, score: v.pot * 0.7 + v.ovr * 0.3 + (have.has(s.players[id].positions[0]) ? 0 : 1.5) }; })
    .sort((a, b) => b.score - a.score)[0];
  if (best) makePick(s, pickId, best.id);
}

/** Auto-draft until it's the user's pick (or the draft ends). Returns the user's pick if waiting. */
export function draftUntilUser(s: GameState): DraftPick | undefined {
  for (let guard = 0; guard < 80; guard++) {
    const p = nextPick(s);
    if (!p) return undefined;
    if (p.owner === s.userTeamId) return p;
    aiPick(s, p.id);
  }
  return undefined;
}
