// Injury table shared by the post-game roll (quick sim) and live games.
import type { Player } from './model';

type Rng = () => number;

export const INJURIES: [string, number, number, number][] = [
  // name, weight, minDays, maxDays
  ['Ankle sprain', 30, 2, 12], ['Knee soreness', 20, 1, 6], ['Hamstring strain', 14, 5, 20], ['Back spasms', 10, 2, 8],
  ['Concussion', 5, 7, 14], ['Calf strain', 8, 8, 25], ['Broken finger', 5, 14, 35], ['Torn meniscus', 4, 30, 70],
  ['Fractured foot', 2, 45, 100], ['Torn ACL', 1, 220, 320], ['Illness', 12, 1, 4],
];

/** Chance of an injury per minute on the floor (before team and fatigue multipliers). */
export const injuryRatePerMinute = (p: Player) => (0.0045 / 36) * (0.4 + p.ratings.injuryProne);

export function rollInjuryType(rng: Rng): { name: string; days: number } {
  let r = rng() * INJURIES.reduce((s, x) => s + x[1], 0);
  const inj = INJURIES.find((x) => (r -= x[1]) <= 0) ?? INJURIES[0];
  return { name: inj[0], days: Math.round(inj[2] + rng() * (inj[3] - inj[2])) };
}
