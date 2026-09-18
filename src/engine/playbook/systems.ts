// Offensive systems, defensive schemes, AI tactic picks.
import type { Player, Tactics } from '../model';
import type { DefScheme, OffSystem, SchemeDef, SystemDef } from './types';

export const SYSTEMS: Record<OffSystem, SystemDef> = {
  motion: { id: 'motion', name: 'Motion', desc: 'Read-and-react ball movement. Rewards passing and IQ across the roster.',
    plays: { 'motion-5out': 3, flex: 2, dho: 2, 'pin-down': 2, 'horns-flare': 1, 'high-pnr': 1 }, pace: 0, threeMul: 1.03, assistMul: 1.08, toMul: 1.0 },
  pnr: { id: 'pnr', name: 'Pick & Roll', desc: 'Built around a lead handler and a rolling or popping big.',
    plays: { 'high-pnr': 3, 'side-pnr': 2, 'spain-pnr': 2, 'double-drag': 2, horns: 1, drag: 1 }, pace: 0, threeMul: 1.0, assistMul: 1.0, toMul: 0.98 },
  princeton: { id: 'princeton', name: 'Princeton', desc: 'Backdoor cuts and high-post passing. Slow, patient, few turnovers.',
    plays: { chin: 3, dho: 2, flex: 1, elevator: 1, 'pin-down': 1 }, pace: -12, threeMul: 0.95, assistMul: 1.12, toMul: 0.92 },
  triangle: { id: 'triangle', name: 'Triangle', desc: 'Sideline triangle with post entries and split cuts.',
    plays: { 'corner-split': 3, 'post-low': 2, 'elbow-post': 1, 'pin-down': 1 }, pace: -8, threeMul: 0.88, assistMul: 1.05, toMul: 0.97 },
  post: { id: 'post', name: 'Inside-Out', desc: 'Pound it inside to the bigs, kick out when the defense collapses.',
    plays: { 'post-low': 3, 'elbow-post': 2, horns: 1, 'high-pnr': 1, iso: 1 }, pace: -6, threeMul: 0.85, assistMul: 0.95, toMul: 1.02 },
  seven: { id: 'seven', name: 'Seven Seconds', desc: 'Push every miss and make. Early threes and drag screens.',
    plays: { drag: 3, 'early-three': 3, 'high-pnr': 2, 'double-drag': 1 }, pace: 18, threeMul: 1.15, assistMul: 1.0, toMul: 1.05 },
  iso: { id: 'iso', name: 'Heliocentric', desc: 'Give the ball to the star and get out of the way.',
    plays: { iso: 3, 'high-pnr': 2, 'elbow-post': 1, 'side-pnr': 1 }, pace: -5, threeMul: 1.0, assistMul: 0.85, toMul: 0.96 },
};

const ZONE23 = [{ x: 22, y: 19 }, { x: 22, y: 31 }, { x: 10, y: 9 }, { x: 10, y: 41 }, { x: 6.5, y: 25 }];
const ZONE32 = [{ x: 27, y: 25 }, { x: 21, y: 11 }, { x: 21, y: 39 }, { x: 8, y: 19 }, { x: 8, y: 31 }];
const BOX = [{ x: 30, y: 25 }, { x: 18, y: 18 }, { x: 18, y: 32 }, { x: 7, y: 18 }, { x: 7, y: 32 }];

export const SCHEMES: Record<DefScheme, SchemeDef> = {
  man:    { id: 'man', name: 'Man-to-Man', desc: 'Standard man defense with help from the weak side.',
    rimD: 0, midD: 0, threeD: 0, toMul: 1, foulMul: 1, drainMul: 1, threeRateMul: 1, rimRateMul: 1, orbAllowed: 0, sag: 0.3 },
  switch: { id: 'switch', name: 'Switch Everything', desc: 'Switch all screens. Kills off-ball action, invites mismatches.',
    rimD: -0.008, midD: 0.004, threeD: 0.01, toMul: 1, foulMul: 1.05, drainMul: 1, threeRateMul: 0.95, rimRateMul: 1.05, orbAllowed: 0.01, sag: 0.25 },
  drop:   { id: 'drop', name: 'Drop Coverage', desc: 'Big sags into the paint on ball screens. Protects the rim, concedes pull-ups.',
    rimD: 0.018, midD: -0.022, threeD: -0.005, toMul: 0.95, foulMul: 0.95, drainMul: 0.95, threeRateMul: 1.03, rimRateMul: 0.9, orbAllowed: -0.01, sag: 0.4 },
  hedge:  { id: 'hedge', name: 'Hard Hedge', desc: 'Big jumps out on the handler, then recovers. Forces turnovers, stretches the defense.',
    rimD: -0.005, midD: 0.008, threeD: 0.004, toMul: 1.08, foulMul: 1.03, drainMul: 1.06, threeRateMul: 1, rimRateMul: 1, orbAllowed: 0.01, sag: 0.3 },
  blitz:  { id: 'blitz', name: 'Blitz', desc: 'Trap the ball handler on every screen. High risk, high reward.',
    rimD: -0.01, midD: 0.012, threeD: -0.014, toMul: 1.18, foulMul: 1.08, drainMul: 1.12, threeRateMul: 1.08, rimRateMul: 1, orbAllowed: 0.02, sag: 0.2 },
  zone23: { id: 'zone23', name: '2-3 Zone', desc: 'Pack the paint, dare them to shoot. Weak on the glass.',
    rimD: 0.02, midD: 0.004, threeD: -0.012, toMul: 1.03, foulMul: 0.88, drainMul: 0.9, threeRateMul: 1.15, rimRateMul: 0.85, orbAllowed: 0.035, sag: 0, zone: ZONE23 },
  zone32: { id: 'zone32', name: '3-2 Zone', desc: 'Extend on shooters at the top, soft in the short corner.',
    rimD: 0.004, midD: -0.018, threeD: 0.006, toMul: 1.02, foulMul: 0.9, drainMul: 0.92, threeRateMul: 1.0, rimRateMul: 0.95, orbAllowed: 0.03, sag: 0, zone: ZONE32 },
  box1:   { id: 'box1', name: 'Box-and-One', desc: 'Best defender chases the focus scorer, four in a box.',
    rimD: 0.008, midD: -0.004, threeD: -0.01, toMul: 1, foulMul: 0.95, drainMul: 1, threeRateMul: 1.08, rimRateMul: 0.95, orbAllowed: 0.025, sag: 0, zone: BOX },
  press:  { id: 'press', name: 'Full-Court Press', desc: 'Pressure the inbound and the backcourt. Turnovers and fatigue for both teams.',
    rimD: -0.015, midD: 0, threeD: -0.005, toMul: 1.3, foulMul: 1.15, drainMul: 1.2, threeRateMul: 1, rimRateMul: 1.1, orbAllowed: 0.01, sag: 0.2 },
};

export const defaultTactics = (): Tactics => ({
  pace: 50, threeFocus: 50, crashGlass: 50, transition: 50,
  offense: 'motion', defense: 'man', playWeights: {}, focusPlayer: null, clutchPlay: null,
});

/** AI coach picks a system that fits the roster. */
export function autoTactics(t: Tactics, roster: Player[]) {
  const top = [...roster].filter((p) => !p.injury).sort((a, b) => b.ratings.ovr - a.ratings.ovr).slice(0, 8);
  if (!top.length) return;
  const star = top[0];
  const at = (p: Player) => p.ratings.attrs;
  const avg = (f: (p: Player) => number, n = 8) => top.slice(0, n).reduce((s, p) => s + f(p), 0) / Math.min(n, top.length);
  const big = star.positions[0] === 'C' || star.positions[0] === 'PF';

  if (big && at(star).postScoring >= 78) t.offense = 'post';
  else if (star.ratings.ovr >= 90 && star.ratings.tend.usage >= 0.3) t.offense = 'iso';
  else if (avg((p) => at(p).threePoint) >= 70 && avg((p) => at(p).speed) >= 64) t.offense = 'seven';
  else if (at(star).ballHandle >= 78 && at(star).passing >= 72) t.offense = 'pnr';
  else t.offense = 'motion';

  const rimProt = Math.max(...top.map((p) => at(p).block + at(p).interiorD));
  if (rimProt >= 175) t.defense = 'drop';
  else if (avg((p) => at(p).perimeterD, 5) >= 70) t.defense = 'switch';
  else t.defense = 'man';

  t.focusPlayer = star.id;
  t.pace = 50 + SYSTEMS[t.offense].pace;
}
