// Locker room: team chemistry (morale, continuity, egos, leadership, results, bonding), the captain,
// and team activities the user can run between games. Chemistry is a small but real on-court edge.
import type { GameState, LockerRoom, Player, TeamActivityId } from './model';
import { daysBetween } from './schedule';
import { standings } from './season';
import { clamp } from './mgmt/market';

const fullName = (p: Player) => `${p.firstName} ${p.lastName}`;
const roster = (s: GameState, teamId: string) => Object.values(s.players).filter((p) => p.teamId === teamId && !p.retired);

export function lockerRoom(s: GameState): LockerRoom {
  return (s.lockerRoom ??= { lastActivity: {}, bond: 0 });
}

/** Leadership 0–1 from personality and standing: steady, loyal, hard-working vets lead best. */
export function leadership(p: Player): number {
  const { temperament, loyalty, workEthic, ego } = p.ratings.personality;
  const tenure = Math.min(1, p.yearsPro / 8);
  return clamp((temperament + loyalty + workEthic) / 60 * 0.7 + tenure * 0.3 - (ego >= 17 ? 0.15 : 0), 0, 1);
}

export interface ChemPart { label: string; value: number }
export interface ChemistryReport {
  score: number;
  mood: 'Electric' | 'Strong' | 'Steady' | 'Tense' | 'Toxic';
  parts: ChemPart[];
  core: Player[];                  // top-8 by minutes/OVR the report is built on
  egos: Player[];                  // big egos competing for touches
  unhappy: Player[];
  leaders: Player[];               // natural leaders (captain candidates)
}

export function chemistryReport(s: GameState, teamId: string): ChemistryReport {
  const team = s.teams[teamId];
  const all = roster(s, teamId);
  const core = [...all].sort((a, b) => (b.season.min - a.season.min) || (b.ratings.ovr - a.ratings.ovr)).slice(0, 8);
  const parts: ChemPart[] = [];
  const morale = core.length ? core.reduce((a, p) => a + p.morale, 0) / core.length : 60;
  parts.push({ label: 'Morale', value: Math.round((morale - 60) * 0.6) });
  const stayed = core.filter((p) => p.history[0]?.team === team.abbr).length;
  parts.push({ label: 'Continuity', value: Math.round((stayed / Math.max(1, core.length) - 0.5) * 20) });
  const egos = core.filter((p) => p.ratings.personality.ego >= 17);
  if (egos.length >= 3) parts.push({ label: 'Ego clashes', value: -Math.min(12, (egos.length - 2) * 4) });
  const row = standings(s, undefined, team.league ?? 'NBA').find((r) => r.teamId === teamId);
  if (row && row.last10[0] + row.last10[1] >= 5) parts.push({ label: 'Recent form', value: Math.round((row.last10[0] - row.last10[1]) * 0.7) });
  if (teamId === s.userTeamId) {
    const lr = lockerRoom(s);
    const cap = lr.captain ? s.players[lr.captain] : undefined;
    if (cap && cap.teamId === teamId) parts.push({ label: `Captain ${cap.lastName}`, value: Math.round(leadership(cap) * 10 - 2) });
    else parts.push({ label: 'No captain', value: -2 });
    if (Math.round(lr.bond ?? 0)) parts.push({ label: 'Team bonding', value: Math.round(lr.bond ?? 0) });
  }
  const score = Math.round(clamp(55 + parts.reduce((a, x) => a + x.value, 0), 0, 100));
  const mood = score >= 80 ? 'Electric' : score >= 65 ? 'Strong' : score >= 48 ? 'Steady' : score >= 32 ? 'Tense' : 'Toxic';
  return {
    score, mood, parts, core, egos,
    unhappy: all.filter((p) => p.morale < 40).sort((a, b) => a.morale - b.morale),
    leaders: [...all].sort((a, b) => leadership(b) - leadership(a)).slice(0, 3),
  };
}

/** Make-probability edge from chemistry (±~1%), read by the possession sim. */
export const chemistryEdge = (chem: number | undefined) => ((chem ?? 55) - 55) / 45 * 0.008;

/** Monday tick: refresh every team's chemistry, let bonding fade, captain steadies the room. */
export function chemistryWeekly(s: GameState) {
  if (new Date(`${s.date}T00:00:00Z`).getUTCDay() !== 1) return;
  const lr = lockerRoom(s);
  lr.bond = Math.round((lr.bond ?? 0) * 0.8 * 10) / 10;
  const cap = lr.captain ? s.players[lr.captain] : undefined;
  if (cap && cap.teamId !== s.userTeamId) lr.captain = undefined;
  else if (cap) {
    const lead = leadership(cap);
    for (const p of roster(s, s.userTeamId)) if (p.morale < 45 && p.id !== cap.id) p.morale = clamp(p.morale + Math.round(lead * 2), 0, 100);
  }
  for (const t of Object.values(s.teams)) t.chemistry = chemistryReport(s, t.id).score;
}

export function setCaptain(s: GameState, playerId: string): string | null {
  const p = s.players[playerId];
  if (!p || p.teamId !== s.userTeamId) return 'Not on your roster';
  const lr = lockerRoom(s);
  if (lr.captain === playerId) return null;
  const old = lr.captain ? s.players[lr.captain] : undefined;
  if (old && old.teamId === s.userTeamId) old.morale = clamp(old.morale - 6, 0, 100);
  lr.captain = playerId;
  p.morale = clamp(p.morale + 6, 0, 100);
  if (p.ratings.personality.ego >= 16) for (const x of roster(s, s.userTeamId)) if (x.id !== p.id && x.ratings.personality.ego >= 16) x.morale = clamp(x.morale - 3, 0, 100);
  return null;
}

// ---------- team activities ----------

export interface ActivityDef { id: TeamActivityId; label: string; desc: string; cost: number; cooldown: number }
export const ACTIVITIES: ActivityDef[] = [
  { id: 'dinner', label: 'Team dinner', desc: 'Night out on the club. Small morale lift and some bonding.', cost: 40_000, cooldown: 14 },
  { id: 'film', label: 'Extra film session', desc: 'Sharpens the system (+familiarity), but players grumble about the extra hours.', cost: 0, cooldown: 7 },
  { id: 'community', label: 'Community day', desc: 'Clinics and hospital visits. Fans and ownership love it.', cost: 60_000, cooldown: 21 },
  { id: 'playersMeeting', label: 'Players-only meeting', desc: 'Clears the air when the room is tense — feels forced when things are fine. A good captain helps.', cost: 0, cooldown: 21 },
  { id: 'retreat', label: 'Team retreat', desc: 'Two days away together. Big bonding boost and a fresh mind.', cost: 250_000, cooldown: 60 },
];

export function activityReadyIn(s: GameState, id: TeamActivityId): number {
  const def = ACTIVITIES.find((a) => a.id === id)!;
  const last = lockerRoom(s).lastActivity?.[id];
  if (!last) return 0;
  return Math.max(0, def.cooldown - daysBetween(last, s.date));
}

/** Runs an activity for the user's team. Returns the outcome text, or an error. */
export function runActivity(s: GameState, id: TeamActivityId): { ok: boolean; text: string } {
  const def = ACTIVITIES.find((a) => a.id === id);
  if (!def) return { ok: false, text: 'Unknown activity' };
  if (s.manager.unemployed) return { ok: false, text: 'You need a job first' };
  const wait = activityReadyIn(s, id);
  if (wait > 0) return { ok: false, text: `Available again in ${wait} day${wait === 1 ? '' : 's'}` };
  const lr = lockerRoom(s);
  const team = s.teams[s.userTeamId];
  const ps = roster(s, s.userTeamId);
  const bump = (v: number, who: Player[] = ps) => who.forEach((p) => (p.morale = clamp(p.morale + v, 0, 100)));
  const bond = (v: number) => { lr.bond = clamp((lr.bond ?? 0) + v, -10, 10); };
  s.finance.cash -= def.cost;
  s.finance.expense.operations += def.cost;
  (lr.lastActivity ??= {})[id] = s.date;
  let text = '';
  switch (id) {
    case 'dinner': bump(3); bond(3); text = 'Good food, good stories. The group is a little tighter.'; break;
    case 'film':
      team.familiarity = clamp((team.familiarity ?? 60) + 3, 0, 100);
      bump(-1); ps.forEach((p) => (p.fatigue = clamp((p.fatigue ?? 0) + 3, 0, 100)));
      text = 'Long session in the film room. The system is clicking — the players are tired of the screen.';
      break;
    case 'community':
      bump(2); bond(1);
      s.finance.hype = clamp((s.finance.hype ?? 50) + 4, 0, 100);
      s.board.confidence = clamp(s.board.confidence + 1, 0, 100);
      text = 'A great day in the community. Fan hype is up and ownership noticed.';
      break;
    case 'playersMeeting': {
      const rep = chemistryReport(s, s.userTeamId);
      const cap = lr.captain ? s.players[lr.captain] : undefined;
      const lead = cap && cap.teamId === s.userTeamId ? leadership(cap) : 0.3;
      if (rep.score < 50) {
        bond(3 + Math.round(lead * 4));
        bump(3 + Math.round(lead * 3), rep.unhappy.length ? rep.unhappy : ps);
        text = `${cap ? `${fullName(cap)} ran the meeting. ` : ''}Some hard truths were said — the air is clearer now.`;
      } else {
        bond(-2);
        text = "The room was fine — the meeting felt forced and a few players rolled their eyes.";
      }
      break;
    }
    case 'retreat':
      bump(5); bond(6);
      ps.forEach((p) => (p.fatigue = clamp((p.fatigue ?? 0) - 10, 0, 100)));
      text = 'Two days away from the arena. The group came back refreshed and closer than ever.';
      break;
  }
  team.chemistry = chemistryReport(s, s.userTeamId).score;
  return { ok: true, text };
}
