// EuroLeague postseason: play-in for seeds 7–8, best-of-5 quarter-finals, then a single-game Final Four.
import type { GameState, Series } from './model';
import { standings } from './season';
import { addDays } from './schedule';

const EL = 'EL';
const add = (s: GameState, se: Omit<Series, 'winsHigh' | 'winsLow'>) => s.series.push({ ...se, winsHigh: 0, winsLow: 0 });
const find = (s: GameState, id: string) => s.series.find((x) => x.id === id);
const loserOf = (se: Series) => (se.winner === se.high ? se.low : se.high);

function msg(s: GameState, subject: string, body: string) {
  s.messages.unshift({ id: s.nextId++, date: s.date, from: 'EuroLeague Office', subject, body, read: false, kind: 'league' });
}

export const elRegularDone = (s: GameState) =>
  s.games.some((g) => g.comp === EL) && s.games.every((g) => g.comp !== EL || g.type !== 'regular' || g.result);

export function elStartPostseason(s: GameState) {
  if (s.series.some((x) => x.comp === EL)) return;
  const t = standings(s, undefined, EL).map((r) => r.teamId);
  if (t.length < 10) return;
  add(s, { id: 'EL-PI-7v8', comp: EL, kind: 'playin', round: 0, conf: null, high: t[6], low: t[7], bestOf: 1 });
  add(s, { id: 'EL-PI-9v10', comp: EL, kind: 'playin', round: 0, conf: null, high: t[8], low: t[9], bestOf: 1 });
  msg(s, 'EuroLeague play-in', `Regular season over. ${s.teams[t[0]].name} finished first.`);
}

/** Called each postseason day: builds the next EuroLeague round and schedules its games. */
export function elTick(s: GameState) {
  const seedOrder = standings(s, undefined, EL).map((r) => r.teamId);
  const seedOf = (id: string) => seedOrder.indexOf(id);
  const series = () => s.series.filter((x) => x.comp === EL);

  // Play-in → second game → quarter-finals.
  const pi78 = find(s, 'EL-PI-7v8'), pi910 = find(s, 'EL-PI-9v10'), pi8 = find(s, 'EL-PI-8th');
  if (pi78?.winner && pi910?.winner && !pi8) {
    add(s, { id: 'EL-PI-8th', comp: EL, kind: 'playin', round: 0, conf: null, high: loserOf(pi78), low: pi910.winner, bestOf: 1 });
  }
  const qfExist = series().some((x) => x.round === 1);
  if (!qfExist && pi78?.winner && find(s, 'EL-PI-8th')?.winner) {
    const seeds = [...seedOrder.slice(0, 6), pi78.winner, find(s, 'EL-PI-8th')!.winner!];
    const pairs: [number, number, string][] = [[0, 7, 'A'], [1, 6, 'B'], [2, 5, 'C'], [3, 4, 'D']];
    for (const [h, l, slot] of pairs) {
      add(s, { id: `EL-QF-${slot}`, comp: EL, kind: 'playoff', round: 1, conf: null, high: seeds[h], low: seeds[l], bestOf: 5, slot });
    }
    msg(s, 'Quarter-finals set', 'Best-of-five series decide the Final Four.');
  }

  // Quarter-finals → Final Four semi-finals (best remaining seed plays the weakest).
  const qf = series().filter((x) => x.round === 1);
  if (qf.length === 4 && qf.every((x) => x.winner) && !series().some((x) => x.round === 2)) {
    const winners = qf.map((x) => x.winner!).sort((a, b) => seedOf(a) - seedOf(b));
    add(s, { id: 'EL-SF-1', comp: EL, kind: 'playoff', round: 2, conf: null, high: winners[0], low: winners[3], bestOf: 1, slot: 'S1' });
    add(s, { id: 'EL-SF-2', comp: EL, kind: 'playoff', round: 2, conf: null, high: winners[1], low: winners[2], bestOf: 1, slot: 'S2' });
    msg(s, 'Final Four', `${winners.map((w) => s.teams[w].name).join(', ')} reach the Final Four.`);
  }

  // Semi-finals → final.
  const sf = series().filter((x) => x.round === 2);
  if (sf.length === 2 && sf.every((x) => x.winner) && !series().some((x) => x.round === 3)) {
    const [a, b] = sf.map((x) => x.winner!);
    const [high, low] = seedOf(a) <= seedOf(b) ? [a, b] : [b, a];
    add(s, { id: 'EL-Final', comp: EL, kind: 'playoff', round: 3, conf: null, high, low, bestOf: 1 });
  }

  const final = series().find((x) => x.round === 3);
  if (final?.winner && !s.elChampion) {
    s.elChampion = final.winner;
    const t = s.teams[final.winner];
    msg(s, `${t.name} win the EuroLeague`, `${t.name} beat ${s.teams[loserOf(final)].name} in the final.`);
  }

  // Schedule the next game of every live EuroLeague series.
  for (const se of series()) {
    if (se.winner || s.games.some((g) => g.seriesId === se.id && !g.result)) continue;
    const n = se.winsHigh + se.winsLow + 1;
    const highHome = se.bestOf === 1 || [1, 2, 5].includes(n);
    s.games.push({
      id: s.nextId++, date: addDays(s.date, se.round >= 2 ? 3 : 2), comp: EL,
      home: highHome ? se.high : se.low, away: highHome ? se.low : se.high,
      type: se.kind === 'playin' ? 'playin' : 'playoff', seriesId: se.id,
    });
  }
}
