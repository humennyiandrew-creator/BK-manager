// NBA 82-game schedule: 4×division, 4 or 3×conference, 2×other conference.
import type { Game, TeamState } from './model';
import { mulberry32, type Rng } from './rng';

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Orient edges of an even-degree graph so every node has in = out (Euler circuits). */
function eulerOrient(edges: [string, string][]): [string, string][] {
  const adj = new Map<string, { to: string; e: number }[]>();
  edges.forEach(([a, b], e) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push({ to: b, e });
    adj.get(b)!.push({ to: a, e });
  });
  const used = new Array(edges.length).fill(false);
  const out: [string, string][] = [];
  for (const start of adj.keys()) {
    const stack = [start];
    while (stack.length) {
      const v = stack[stack.length - 1];
      const list = adj.get(v)!;
      while (list.length && used[list[list.length - 1].e]) list.pop();
      if (!list.length) { stack.pop(); continue; }
      const { to, e } = list.pop()!;
      used[e] = true;
      out.push([v, to]); // walk direction v → to
      stack.push(to);
    }
  }
  return out;
}

/** Returns [home, away] pairs, 1230 total, every team 41 home / 41 away. */
export function buildMatchups(teams: TeamState[], seasonYear: number): [string, string][] {
  const byDiv = new Map<string, TeamState[]>();
  for (const t of [...teams].sort((a, b) => a.abbr.localeCompare(b.abbr))) {
    if (!byDiv.has(t.division)) byDiv.set(t.division, []);
    byDiv.get(t.division)!.push(t);
  }
  const idx = new Map<string, number>();
  for (const list of byDiv.values()) list.forEach((t, i) => idx.set(t.id, i));
  const divs = [...byDiv.keys()].sort();
  const pairs: [string, string][] = [];
  const threeGame: [string, string][] = [];

  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const a = teams[i], b = teams[j];
      if (a.conference !== b.conference) {
        pairs.push([a.id, b.id], [b.id, a.id]);
      } else if (a.division === b.division) {
        pairs.push([a.id, b.id], [b.id, a.id], [a.id, b.id], [b.id, a.id]);
      } else {
        // 3 of 5 teams in each other division get 4 games; rotates by season.
        const off = divs.indexOf(a.division) + divs.indexOf(b.division) + seasonYear;
        const four = (idx.get(a.id)! + idx.get(b.id)! + off) % 5 < 3;
        pairs.push([a.id, b.id], [b.id, a.id]);
        if (four) pairs.push([a.id, b.id], [b.id, a.id]);
        else threeGame.push([a.id, b.id]);
      }
    }
  }
  // Each team has 4 three-game opponents → degree-4 graph → Euler orientation gives exactly 2 extra homes each.
  return [...pairs, ...eulerOrient(threeGame)];
}

const SEASON_DAYS = 174; // ~Oct 20 → Apr 12

/** Spread matchups over dates. Max one game per team per day, no 3-in-3. */
export function buildSchedule(teams: TeamState[], seasonYear: number, seed: number, firstId: number): Game[] {
  const rng = mulberry32(seed ^ 0x5eed);
  const pool = shuffle(buildMatchups(teams, seasonYear), rng);
  const start = `${seasonYear}-10-20`;
  const remaining = new Map<string, number>();
  for (const [h, a] of pool) {
    remaining.set(h, (remaining.get(h) ?? 0) + 1);
    remaining.set(a, (remaining.get(a) ?? 0) + 1);
  }
  const last = new Map<string, number>();   // last day index played
  const prev = new Map<string, number>();   // day before that
  const games: Game[] = [];
  let id = firstId;

  for (let day = 0; pool.length; day++) {
    const daysLeft = Math.max(1, SEASON_DAYS - day);
    const target = Math.max(2, Math.round(pool.length / daysLeft + (rng() - 0.5) * 4));
    const busy = new Set<string>();
    // Prefer teams with most games left per remaining day.
    pool.sort((x, y) => (remaining.get(y[0])! + remaining.get(y[1])!) - (remaining.get(x[0])! + remaining.get(x[1])!));
    let n = 0;
    for (let i = 0; i < pool.length && n < target; i++) {
      const [h, a] = pool[i];
      const ok = (t: string) => !busy.has(t) && !(last.get(t) === day - 1 && prev.get(t) === day - 2);
      if (!ok(h) || !ok(a)) continue;
      pool.splice(i--, 1);
      for (const t of [h, a]) {
        busy.add(t);
        prev.set(t, last.get(t) ?? -9);
        last.set(t, day);
        remaining.set(t, remaining.get(t)! - 1);
      }
      games.push({ id: id++, date: addDays(start, day), home: h, away: a, type: 'regular' });
      n++;
    }
  }
  return games;
}
