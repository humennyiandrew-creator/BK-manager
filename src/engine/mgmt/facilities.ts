// Team facilities: training, medical, arena, scouting, analytics.
import type { Facility, FacilityId, GameState } from '../model';
import { hashString, mulberry32 } from '../rng';
import { addDays } from '../schedule';
import { clamp, marketFactor, teamStrength } from './market';

export const FACILITY_IDS: FacilityId[] = ['training', 'medical', 'arena', 'scouting', 'analytics'];
export const FACILITY_LABEL: Record<FacilityId, string> = {
  training: 'Training Center',
  medical: 'Medical & Recovery',
  arena: 'Arena',
  scouting: 'Scouting Department',
  analytics: 'Analytics Lab',
};
export const FACILITY_EFFECT: Record<FacilityId, string> = {
  training: 'Boosts player growth from practice.',
  medical: 'Reduces injury risk and speeds recovery.',
  arena: 'Raises attendance and ticket revenue.',
  scouting: 'Sharpens scouting reports on prospects and opponents.',
  analytics: 'Improves in-game and roster decision support.',
};

export function initFacilities(s: GameState): void {
  const rng = mulberry32(hashString(`${s.seed}|facilities`));
  for (const team of Object.values(s.teams)) {
    const strengthNorm = clamp((teamStrength(s, team.id) - 65) / 25, 0, 1);
    const marketNorm = clamp((marketFactor(team.abbr) - 0.8) / 0.7, 0, 1);
    const bias = (strengthNorm + marketNorm) / 2;
    const teamFacilities = {} as Record<FacilityId, Facility>;
    for (const id of FACILITY_IDS) {
      const level = clamp(Math.round(2 + bias * 2 + (rng() - 0.5) * 2), 1, 5);
      teamFacilities[id] = { level };
    }
    s.facilities[team.id] = teamFacilities;
  }
}

export function facilityLevel(s: GameState, teamId: string, id: FacilityId): number {
  return s.facilities[teamId]?.[id]?.level ?? 3;
}

export function upgradeCost(s: GameState, teamId: string, id: FacilityId): { cost: number; days: number } {
  const level = facilityLevel(s, teamId, id);
  if (level >= 5) return { cost: Infinity, days: 0 };
  const t = (level - 1) / 4;
  return { cost: Math.round(8_000_000 + t * 32_000_000), days: Math.round(30 + t * 120) };
}

function msg(s: GameState, subject: string, body: string) {
  s.messages.unshift({ id: s.nextId++, date: s.date, from: 'Facilities', subject, body, read: false, kind: 'finance' });
}

export function startUpgrade(s: GameState, id: FacilityId): string | null {
  const fac = s.facilities[s.userTeamId][id];
  if (fac.level >= 5) return 'Already at maximum level';
  if (fac.upgrade) return 'Upgrade already in progress';
  const { cost, days } = upgradeCost(s, s.userTeamId, id);
  if (s.finance.cash < cost) return 'Not enough cash';
  s.finance.cash -= cost;
  s.finance.expense.facilities += cost;
  fac.upgrade = { to: fac.level + 1, done: addDays(s.date, days), cost };
  return null;
}

export function facilitiesDaily(s: GameState): void {
  for (const [teamId, facs] of Object.entries(s.facilities)) {
    for (const id of FACILITY_IDS) {
      const fac = facs[id];
      if (fac.upgrade && fac.upgrade.done <= s.date) {
        fac.level = fac.upgrade.to;
        if (teamId === s.userTeamId) msg(s, `${FACILITY_LABEL[id]} upgraded`, `Now level ${fac.level}.`);
        fac.upgrade = undefined;
      }
    }
  }
}
