// Preset play library. Coordinates in half-court frame (see types.ts).
import type { Play, Spot } from './types';

const s = (x: number, y: number): Spot => ({ x, y });
// Named spots. L = left side (y small), R = right side.
export const S = {
  top: s(29, 25), slotL: s(26, 13), slotR: s(26, 37), wingL: s(21, 5), wingR: s(21, 45),
  cornerL: s(2.5, 2.5), cornerR: s(2.5, 47.5), elbowL: s(19, 17), elbowR: s(19, 33), highPost: s(19, 25),
  blockL: s(7, 18), blockR: s(7, 32), dunkerL: s(4, 20), dunkerR: s(4, 30), rim: s(5.5, 25),
  shortCornerL: s(6, 9), shortCornerR: s(6, 41), ftLine: s(19, 25), deep: s(34, 25), wingHighL: s(25, 8), wingHighR: s(25, 42),
  midL: s(14, 12), midR: s(14, 38), laneL: s(10, 20), laneR: s(10, 30),
};

export const PLAYS: Play[] = [
  {
    id: 'high-pnr', name: 'High Pick & Roll', category: 'pnr',
    desc: 'Center sets a ball screen at the top; handler attacks, center rolls, shooters spaced.',
    start: { 1: S.deep, 2: S.cornerL, 3: S.cornerR, 4: S.wingL, 5: S.highPost },
    steps: [
      { t: 2, move: { 1: S.top, 5: s(27, 21) }, dribble: 1, screen: [5, 1], label: 'high screen' },
      { t: 2.5, move: { 1: s(16, 30), 5: S.laneL, 4: S.wingHighL }, dribble: 1 },
      { t: 1.5, move: { 1: s(11, 28), 5: S.rim } , dribble: 1 },
    ],
    options: [{ role: 1, shot: 'rim', weight: 3 }, { role: 1, shot: 'mid', weight: 2 }, { role: 5, shot: 'rim', weight: 3 }, { role: 2, shot: 'three', weight: 1.5 }, { role: 3, shot: 'three', weight: 1.5 }],
    strongVs: ['drop', 'zone32'], weakVs: ['blitz', 'hedge'], keyAttrs: ['ballHandle', 'midRange', 'vision', 'dunk'],
  },
  {
    id: 'spain-pnr', name: 'Spain Pick & Roll', category: 'pnr',
    desc: 'High PnR plus a back-screen on the roller’s defender; a shooter pops for three.',
    start: { 1: S.deep, 2: S.slotL, 3: S.cornerR, 4: S.cornerL, 5: S.highPost },
    steps: [
      { t: 2, move: { 1: S.top, 5: s(27, 23) }, dribble: 1, screen: [5, 1], label: 'Spain action' },
      { t: 2, move: { 5: S.laneR, 2: s(22, 24) }, screen: [2, 5], dribble: 1 },
      { t: 1.5, move: { 5: S.rim, 2: S.top, 1: s(15, 18) }, dribble: 1 },
    ],
    options: [{ role: 5, shot: 'rim', weight: 3 }, { role: 2, shot: 'three', weight: 3 }, { role: 1, shot: 'mid', weight: 2 }, { role: 1, shot: 'rim', weight: 1.5 }],
    strongVs: ['drop', 'switch'], weakVs: ['zone23'], keyAttrs: ['threePoint', 'passing', 'dunk'],
  },
  {
    id: 'side-pnr', name: 'Side Pick & Roll', category: 'pnr',
    desc: 'Ball screen on the wing, weak side loaded with shooters.',
    start: { 1: S.wingHighL, 2: S.cornerR, 3: S.wingR, 4: S.cornerL, 5: S.elbowL },
    steps: [
      { t: 2, move: { 5: s(22, 11) }, screen: [5, 1], label: 'side ball screen' },
      { t: 2.5, move: { 1: S.midL, 5: S.dunkerL }, dribble: 1 },
      { t: 1.5, move: { 1: S.laneL }, dribble: 1 },
    ],
    options: [{ role: 1, shot: 'rim', weight: 2 }, { role: 1, shot: 'mid', weight: 2 }, { role: 5, shot: 'rim', weight: 2.5 }, { role: 3, shot: 'three', weight: 2 }, { role: 4, shot: 'three', weight: 1 }],
    strongVs: ['hedge'], weakVs: ['blitz'], keyAttrs: ['ballHandle', 'layup'],
  },
  {
    id: 'double-drag', name: 'Double Drag', category: 'pnr',
    desc: 'Two bigs screen in sequence in early offense; one rolls, one pops.',
    start: { 1: s(40, 22), 2: S.cornerL, 3: S.cornerR, 4: s(30, 18), 5: s(31, 28) },
    steps: [
      { t: 1.5, move: { 1: s(30, 30) }, dribble: 1, screen: [4, 1], label: 'double drag' },
      { t: 1.5, move: { 1: s(22, 34), 4: S.wingHighL }, dribble: 1, screen: [5, 1] },
      { t: 2, move: { 1: s(12, 32), 5: S.rim }, dribble: 1 },
    ],
    options: [{ role: 5, shot: 'rim', weight: 3 }, { role: 4, shot: 'three', weight: 2.5 }, { role: 1, shot: 'rim', weight: 2 }, { role: 1, shot: 'three', weight: 1 }],
    strongVs: ['drop', 'man'], weakVs: ['switch'], keyAttrs: ['speed', 'threePoint', 'vision'],
  },
  {
    id: 'drag', name: 'Drag Screen', category: 'transition',
    desc: 'Trailing big sets a ball screen before the defense is set.',
    start: { 1: s(42, 25), 2: S.cornerL, 3: S.cornerR, 4: S.wingHighL, 5: s(38, 30) },
    steps: [
      { t: 1.2, move: { 1: s(30, 30), 5: s(30, 28) }, dribble: 1, screen: [5, 1], label: 'drag screen' },
      { t: 1.8, move: { 1: s(14, 32), 5: S.rim }, dribble: 1 },
    ],
    options: [{ role: 1, shot: 'three', weight: 2 }, { role: 1, shot: 'rim', weight: 2 }, { role: 5, shot: 'rim', weight: 2.5 }, { role: 2, shot: 'three', weight: 1.5 }],
    strongVs: ['drop', 'zone23', 'zone32'], weakVs: ['press'], keyAttrs: ['speed', 'threePoint'],
  },
  {
    id: 'early-three', name: 'Early Offense Three', category: 'transition',
    desc: 'Fill the lanes, kick ahead to a trailer or corner shooter.',
    start: { 1: s(40, 25), 2: S.wingHighL, 3: S.wingHighR, 4: s(44, 18), 5: S.rim },
    steps: [
      { t: 1.5, move: { 1: S.top, 2: S.cornerL, 3: S.cornerR, 4: S.slotL }, dribble: 1, label: 'push ahead' },
      { t: 1, pass: 4, move: { 4: s(25, 12) } },
    ],
    options: [{ role: 4, shot: 'three', weight: 2 }, { role: 2, shot: 'three', weight: 2 }, { role: 3, shot: 'three', weight: 2 }, { role: 5, shot: 'rim', weight: 1 }],
    strongVs: ['zone23', 'man'], weakVs: ['switch'], keyAttrs: ['threePoint', 'speed'],
  },
  {
    id: 'horns', name: 'Horns', category: 'horns',
    desc: 'Bigs at both elbows, wings in the corners; handler picks a side.',
    start: { 1: S.deep, 2: S.cornerL, 3: S.cornerR, 4: S.elbowL, 5: S.elbowR },
    steps: [
      { t: 2, move: { 1: S.top }, dribble: 1, label: 'horns set' },
      { t: 2, move: { 1: s(20, 36), 5: S.laneR }, dribble: 1, screen: [5, 1] },
      { t: 1.5, move: { 5: S.rim, 4: S.top }, dribble: 1 },
    ],
    options: [{ role: 5, shot: 'rim', weight: 2.5 }, { role: 4, shot: 'three', weight: 2 }, { role: 1, shot: 'mid', weight: 2 }, { role: 2, shot: 'three', weight: 1 }],
    strongVs: ['hedge', 'man'], weakVs: ['zone32'], keyAttrs: ['passing', 'midRange', 'threePoint'],
  },
  {
    id: 'horns-flare', name: 'Horns Flare', category: 'horns',
    desc: 'From horns, a big flare-screens for the shooter drifting to the wing.',
    start: { 1: S.deep, 2: S.slotL, 3: S.cornerR, 4: S.elbowL, 5: S.elbowR },
    steps: [
      { t: 2, move: { 1: S.top }, dribble: 1, label: 'horns flare' },
      { t: 1.5, move: { 4: s(24, 14), 2: S.wingL }, screen: [4, 2] },
      { t: 1, pass: 2 },
    ],
    options: [{ role: 2, shot: 'three', weight: 4 }, { role: 4, shot: 'rim', weight: 1 }, { role: 5, shot: 'rim', weight: 1 }],
    strongVs: ['switch', 'drop'], weakVs: ['zone23'], keyAttrs: ['threePoint', 'passing'],
  },
  {
    id: 'floppy', name: 'Floppy', category: 'off-ball',
    desc: 'Shooter starts under the rim and chooses a side off staggered screens.',
    start: { 1: S.top, 2: S.rim, 3: S.wingR, 4: S.blockL, 5: S.blockR },
    steps: [
      { t: 1.5, move: { 4: s(9, 16), 5: s(9, 34) }, label: 'floppy' },
      { t: 2, move: { 2: S.wingL }, screen: [4, 2] },
      { t: 1, pass: 2 },
    ],
    options: [{ role: 2, shot: 'three', weight: 3 }, { role: 2, shot: 'mid', weight: 2 }, { role: 5, shot: 'rim', weight: 1 }],
    strongVs: ['man', 'hedge'], weakVs: ['switch'], keyAttrs: ['threePoint', 'midRange', 'acceleration'],
  },
  {
    id: 'pin-down', name: 'Pin-Down', category: 'off-ball',
    desc: 'Big screens down for a wing curling to the elbow or popping to the wing.',
    start: { 1: S.top, 2: S.blockL, 3: S.cornerR, 4: S.wingL, 5: S.blockR },
    steps: [
      { t: 1.5, move: { 4: s(10, 14) }, screen: [4, 2], label: 'pin-down' },
      { t: 1.5, move: { 2: S.wingL } },
      { t: 1, pass: 2 },
    ],
    options: [{ role: 2, shot: 'three', weight: 2.5 }, { role: 2, shot: 'mid', weight: 2 }, { role: 4, shot: 'rim', weight: 1 }],
    strongVs: ['man', 'drop'], weakVs: ['zone32'], keyAttrs: ['threePoint', 'midRange'],
  },
  {
    id: 'hammer', name: 'Hammer', category: 'off-ball',
    desc: 'Baseline drive draws help while a backside screen frees the corner shooter.',
    start: { 1: S.wingR, 2: S.cornerL, 3: S.cornerR, 4: S.blockL, 5: S.elbowR },
    steps: [
      { t: 2, move: { 1: s(8, 38) }, dribble: 1, label: 'baseline drive' },
      { t: 1, move: { 4: s(6, 8), 2: s(3, 5) }, screen: [4, 2] },
      { t: 1, pass: 2 },
    ],
    options: [{ role: 2, shot: 'three', weight: 3.5 }, { role: 1, shot: 'rim', weight: 1.5 }, { role: 5, shot: 'rim', weight: 1 }],
    strongVs: ['man', 'blitz'], weakVs: ['zone23'], keyAttrs: ['threePoint', 'ballHandle', 'passing'],
  },
  {
    id: 'iverson', name: 'Iverson Cut', category: 'off-ball',
    desc: 'Wing cuts across both elbows off big screens to catch at the opposite slot.',
    start: { 1: S.top, 2: S.wingL, 3: S.cornerR, 4: S.elbowL, 5: S.elbowR },
    steps: [
      { t: 2.5, move: { 2: S.wingHighR, 1: S.slotL }, screen: [4, 2], label: 'Iverson cut' },
      { t: 1, pass: 2 },
      { t: 1.5, move: { 2: s(16, 36), 5: S.laneR }, dribble: 2, screen: [5, 2] },
    ],
    options: [{ role: 2, shot: 'mid', weight: 2.5 }, { role: 2, shot: 'rim', weight: 2 }, { role: 5, shot: 'rim', weight: 1.5 }],
    strongVs: ['drop', 'hedge'], weakVs: ['switch'], keyAttrs: ['speed', 'ballHandle', 'midRange'],
  },
  {
    id: 'elevator', name: 'Elevator Doors', category: 'off-ball',
    desc: 'Shooter runs through two bigs who close the door on his defender.',
    start: { 1: S.wingL, 2: S.rim, 3: S.cornerR, 4: s(18, 22), 5: s(18, 28) },
    steps: [
      { t: 2, move: { 2: s(16, 25) }, label: 'elevator' },
      { t: 1, move: { 2: S.top, 4: s(19, 24), 5: s(19, 26) }, screen: [4, 2] },
      { t: 0.8, pass: 2 },
    ],
    options: [{ role: 2, shot: 'three', weight: 4 }, { role: 4, shot: 'mid', weight: 1 }],
    strongVs: ['man', 'switch'], weakVs: ['zone32'], keyAttrs: ['threePoint'],
  },
  {
    id: 'post-low', name: 'Low Post Entry', category: 'post',
    desc: 'Feed the big on the block; cutters and shooters react to the double.',
    start: { 1: S.top, 2: S.wingL, 3: S.cornerR, 4: S.slotR, 5: S.elbowL },
    steps: [
      { t: 2, move: { 5: S.blockL }, label: 'post entry' },
      { t: 1, pass: 2 },
      { t: 1, pass: 5, move: { 2: S.cornerL } },
      { t: 2.5, move: { 5: s(6, 21) } },
    ],
    options: [{ role: 5, shot: 'rim', weight: 3 }, { role: 5, shot: 'mid', weight: 2 }, { role: 2, shot: 'three', weight: 1.2 }, { role: 4, shot: 'three', weight: 1 }],
    strongVs: ['switch', 'zone32'], weakVs: ['zone23'], keyAttrs: ['postScoring', 'strength', 'closeShot'],
  },
  {
    id: 'elbow-post', name: 'Elbow Post', category: 'post',
    desc: 'Power forward catches at the elbow: face up, drive, or hit the cutter.',
    start: { 1: S.wingR, 2: S.cornerL, 3: S.wingL, 4: S.elbowR, 5: S.blockL },
    steps: [
      { t: 1.5, pass: 4, label: 'elbow entry' },
      { t: 1.5, move: { 1: s(10, 38), 3: S.laneL } },
      { t: 1.5, move: { 4: s(12, 30) }, dribble: 4 },
    ],
    options: [{ role: 4, shot: 'mid', weight: 2.5 }, { role: 4, shot: 'rim', weight: 2 }, { role: 3, shot: 'rim', weight: 1.5 }, { role: 2, shot: 'three', weight: 1 }],
    strongVs: ['switch', 'box1'], weakVs: ['zone23'], keyAttrs: ['postScoring', 'midRange', 'passing'],
  },
  {
    id: 'iso', name: 'Isolation', category: 'iso',
    desc: 'Clear a side for the focus player to go one-on-one.',
    start: { 1: S.top, 2: S.cornerL, 3: S.cornerR, 4: S.wingR, 5: S.dunkerR },
    steps: [
      { t: 2.5, move: { 4: S.cornerR, 3: S.wingHighR }, label: 'clear-out' },
      { t: 2.5, move: { 1: s(16, 20) }, dribble: 1 },
    ],
    options: [{ role: 'focus', shot: 'mid', weight: 3 }, { role: 'focus', shot: 'rim', weight: 3 }, { role: 'focus', shot: 'three', weight: 2 }],
    strongVs: ['switch'], weakVs: ['box1', 'blitz'], keyAttrs: ['ballHandle', 'midRange', 'drawFoul'],
  },
  {
    id: 'chin', name: 'Chin Series', category: 'motion',
    desc: 'Princeton chin action: guard back-cuts off a high-post big for a layup.',
    start: { 1: S.slotL, 2: S.wingR, 3: S.cornerL, 4: S.cornerR, 5: S.highPost },
    steps: [
      { t: 1.5, pass: 5, label: 'chin entry' },
      { t: 2, move: { 2: S.rim, 1: S.wingHighR } },
      { t: 1, pass: 2 },
    ],
    options: [{ role: 2, shot: 'rim', weight: 3 }, { role: 5, shot: 'mid', weight: 1.5 }, { role: 3, shot: 'three', weight: 1.5 }],
    strongVs: ['man', 'hedge', 'blitz'], weakVs: ['zone23', 'switch'], keyAttrs: ['passing', 'vision', 'offIQ'],
  },
  {
    id: 'dho', name: 'Dribble Hand-Off Weave', category: 'motion',
    desc: 'Continuous hand-offs around the arc until a defender trails.',
    start: { 1: S.slotL, 2: S.wingR, 3: S.cornerL, 4: S.top, 5: S.dunkerR },
    steps: [
      { t: 1.5, move: { 1: s(27, 20), 4: s(27, 24) }, pass: 4, label: 'DHO' },
      { t: 1.5, move: { 4: s(27, 32), 2: s(26, 34) }, dribble: 4, pass: 2 },
      { t: 1.5, move: { 2: s(14, 34) }, dribble: 2 },
    ],
    options: [{ role: 2, shot: 'rim', weight: 2 }, { role: 2, shot: 'three', weight: 2 }, { role: 5, shot: 'rim', weight: 1.5 }, { role: 1, shot: 'three', weight: 1 }],
    strongVs: ['drop', 'zone32'], weakVs: ['switch'], keyAttrs: ['passing', 'threePoint', 'ballHandle'],
  },
  {
    id: 'motion-5out', name: '5-Out Motion', category: 'motion',
    desc: 'Pass, cut, replace. No fixed shooter — the open man shoots.',
    start: { 1: S.top, 2: S.wingL, 3: S.wingR, 4: S.cornerL, 5: S.cornerR },
    steps: [
      { t: 1.2, pass: 2, move: { 1: S.rim }, label: 'motion' },
      { t: 1.2, move: { 1: S.cornerR, 5: S.wingHighR, 3: S.top } },
      { t: 1.2, pass: 3 },
      { t: 1.4, pass: 5, move: { 4: S.laneL } },
    ],
    options: [{ role: 1, shot: 'rim', weight: 1 }, { role: 2, shot: 'three', weight: 1 }, { role: 3, shot: 'three', weight: 1 }, { role: 4, shot: 'rim', weight: 1 }, { role: 5, shot: 'three', weight: 1 }],
    strongVs: ['blitz', 'hedge', 'box1'], weakVs: ['switch'], keyAttrs: ['passing', 'offIQ', 'threePoint'],
  },
  {
    id: 'flex', name: 'Flex Cut', category: 'motion',
    desc: 'Baseline flex screen for a cutter, followed by a down-screen for the screener.',
    start: { 1: S.slotL, 2: S.cornerR, 3: S.elbowL, 4: S.blockR, 5: S.elbowR },
    steps: [
      { t: 1.5, pass: 5, move: { 1: S.wingHighL }, label: 'flex' },
      { t: 1.5, move: { 2: S.blockL }, screen: [4, 2] },
      { t: 1.5, move: { 4: S.elbowL }, screen: [3, 4], pass: 2 },
    ],
    options: [{ role: 2, shot: 'rim', weight: 2.5 }, { role: 4, shot: 'mid', weight: 2 }, { role: 1, shot: 'three', weight: 1 }],
    strongVs: ['man', 'hedge'], weakVs: ['zone23', 'switch'], keyAttrs: ['offIQ', 'closeShot', 'midRange'],
  },
  {
    id: 'corner-split', name: 'Triangle Corner Split', category: 'post',
    desc: 'Sideline triangle: post entry, then guard and wing split-cut off the post.',
    start: { 1: S.wingHighR, 2: S.cornerR, 3: S.slotL, 4: S.elbowL, 5: S.blockR },
    steps: [
      { t: 1.5, pass: 5, label: 'triangle entry' },
      { t: 1.5, move: { 1: S.laneR, 2: S.wingR } },
      { t: 1.2, pass: 2 },
    ],
    options: [{ role: 5, shot: 'rim', weight: 2 }, { role: 1, shot: 'rim', weight: 1.5 }, { role: 2, shot: 'three', weight: 2 }, { role: 2, shot: 'mid', weight: 1 }],
    strongVs: ['man', 'blitz'], weakVs: ['zone23'], keyAttrs: ['postScoring', 'passing', 'offIQ'],
  },
  {
    id: 'overload', name: 'Zone Overload', category: 'zone-buster',
    desc: 'Load one side with three shooters and a short-corner big to split the zone.',
    start: { 1: S.slotR, 2: S.wingL, 3: S.cornerL, 4: S.highPost, 5: S.shortCornerL },
    steps: [
      { t: 1.5, pass: 2, label: 'overload' },
      { t: 1.2, pass: 4 },
      { t: 1.2, pass: 3 },
    ],
    options: [{ role: 3, shot: 'three', weight: 2.5 }, { role: 4, shot: 'mid', weight: 2 }, { role: 5, shot: 'rim', weight: 1.5 }, { role: 2, shot: 'three', weight: 1.5 }],
    strongVs: ['zone23', 'zone32', 'box1'], weakVs: ['man', 'switch'], keyAttrs: ['threePoint', 'passing'],
  },
];

export const PLAY_BY_ID: Record<string, Play> = Object.fromEntries(PLAYS.map((p) => [p.id, p]));
