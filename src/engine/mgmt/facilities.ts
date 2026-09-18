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

// ---------- upgrade tree ----------

export interface FacilityNode { id: string; facility: FacilityId; label: string; desc: string; cost: number; days: number; prereq: string[] }

export const FACILITY_NODES: FacilityNode[] = [
  // training
  { id: 'training_shootingLab', facility: 'training', label: 'Shooting Lab', desc: '+15% growth on shooting attributes.', cost: 5_000_000, days: 30, prereq: [] },
  { id: 'training_weightRoom', facility: 'training', label: 'Weight Room', desc: '+15% growth on strength/physical attributes.', cost: 4_000_000, days: 25, prereq: [] },
  { id: 'training_recoveryPool', facility: 'training', label: 'Recovery Pool', desc: 'Fatigue recovery +3/day.', cost: 8_000_000, days: 45, prereq: ['training_weightRoom'] },
  { id: 'training_filmRoom', facility: 'training', label: 'Film Room', desc: 'Film sessions +2 familiarity.', cost: 6_000_000, days: 35, prereq: ['training_shootingLab'] },
  { id: 'training_perfCenter', facility: 'training', label: 'Performance Science Center', desc: '+10% growth on all attributes.', cost: 24_000_000, days: 110, prereq: ['training_recoveryPool', 'training_filmRoom'] },
  // medical
  { id: 'medical_cryo', facility: 'medical', label: 'Cryotherapy', desc: 'Injury days −15%.', cost: 5_000_000, days: 30, prereq: [] },
  { id: 'medical_sportsScience', facility: 'medical', label: 'Sports Science', desc: 'Injury risk −10%.', cost: 7_000_000, days: 40, prereq: [] },
  { id: 'medical_nutrition', facility: 'medical', label: 'Nutrition Program', desc: 'Fatigue recovery +2/day.', cost: 4_000_000, days: 20, prereq: [] },
  { id: 'medical_rehab', facility: 'medical', label: 'Rehab Center', desc: 'Faster return from long-term injuries.', cost: 18_000_000, days: 60, prereq: ['medical_cryo', 'medical_sportsScience'] },
  // arena
  { id: 'arena_suites', facility: 'arena', label: 'Premium Suites', desc: '+8% ticket revenue.', cost: 10_000_000, days: 60, prereq: [] },
  { id: 'arena_jumbotron', facility: 'arena', label: 'Jumbotron', desc: '+fan attendance.', cost: 6_000_000, days: 30, prereq: [] },
  { id: 'arena_store', facility: 'arena', label: 'Team Store', desc: '+merch revenue.', cost: 5_000_000, days: 25, prereq: [] },
  { id: 'arena_seating', facility: 'arena', label: 'Expanded Seating', desc: '+3% capacity.', cost: 15_000_000, days: 90, prereq: ['arena_jumbotron'] },
  // scouting
  { id: 'scouting_intlOffice', facility: 'scouting', label: 'International Office', desc: 'Scout range −2 on non-USA prospects.', cost: 5_000_000, days: 30, prereq: [] },
  { id: 'scouting_combine', facility: 'scouting', label: 'Combine Analytics', desc: '+draft evaluation accuracy.', cost: 6_000_000, days: 35, prereq: [] },
  { id: 'scouting_analyticsScouts', facility: 'scouting', label: 'Analytics Scouts', desc: 'Scout range −1 on all prospects.', cost: 7_000_000, days: 40, prereq: ['scouting_intlOffice'] },
  { id: 'scouting_network', facility: 'scouting', label: 'Global Network', desc: '+scouting coverage.', cost: 14_000_000, days: 55, prereq: ['scouting_combine'] },
  // analytics
  { id: 'analytics_tracking', facility: 'analytics', label: 'Tracking Cameras', desc: '+tactic fit edge 0.002.', cost: 8_000_000, days: 40, prereq: [] },
  { id: 'analytics_loadMgmt', facility: 'analytics', label: 'Load Management', desc: 'Fatigue from games −15%.', cost: 7_000_000, days: 35, prereq: [] },
  { id: 'analytics_shotQuality', facility: 'analytics', label: 'Shot Quality Model', desc: '+0.002 three-point edge.', cost: 9_000_000, days: 45, prereq: ['analytics_tracking'] },
  { id: 'analytics_biomech', facility: 'analytics', label: 'Biomechanics Lab', desc: '+injury prevention.', cost: 16_000_000, days: 60, prereq: ['analytics_loadMgmt'] },
];
export const NODE_BY_ID: Record<string, FacilityNode> = Object.fromEntries(FACILITY_NODES.map((n) => [n.id, n]));
export const NODES_BY_FACILITY: Record<FacilityId, FacilityNode[]> = FACILITY_IDS.reduce((acc, id) => {
  acc[id] = FACILITY_NODES.filter((n) => n.facility === id);
  return acc;
}, {} as Record<FacilityId, FacilityNode[]>);

export function hasNode(s: GameState, teamId: string, nodeId: string): boolean {
  const node = NODE_BY_ID[nodeId];
  if (!node) return false;
  return !!s.facilities[teamId]?.[node.facility]?.nodes?.includes(nodeId);
}

export function startNode(s: GameState, nodeId: string): string | null {
  const node = NODE_BY_ID[nodeId];
  if (!node) return 'Unknown node';
  const fac = s.facilities[s.userTeamId][node.facility];
  if (fac.nodes?.includes(nodeId)) return 'Already built';
  if (fac.building) return 'A build is already in progress at this facility';
  if (node.prereq.some((id) => !fac.nodes?.includes(id))) return 'Prerequisites not met';
  if (s.finance.cash < node.cost) return 'Not enough cash';
  s.finance.cash -= node.cost;
  s.finance.expense.facilities += node.cost;
  fac.building = { node: nodeId, done: addDays(s.date, node.days), cost: node.cost };
  return null;
}

export function initFacilities(s: GameState): void {
  const rng = mulberry32(hashString(`${s.seed}|facilities`));
  for (const team of Object.values(s.teams)) {
    const strengthNorm = clamp((teamStrength(s, team.id) - 65) / 25, 0, 1);
    const marketNorm = clamp((marketFactor(team.abbr) - 0.8) / 0.7, 0, 1);
    const bias = (strengthNorm + marketNorm) / 2;
    const teamFacilities = {} as Record<FacilityId, Facility>;
    for (const id of FACILITY_IDS) {
      const level = clamp(Math.round(2 + bias * 2 + (rng() - 0.5) * 2), 1, 5);
      const nodes: string[] = [];
      if (team.id !== s.userTeamId) {
        for (const node of NODES_BY_FACILITY[id]) {
          if (node.prereq.every((pid) => nodes.includes(pid)) && rng() < (level / 5) * 0.55) nodes.push(node.id);
        }
      }
      teamFacilities[id] = { level, nodes };
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
      if (fac.building && fac.building.done <= s.date) {
        const node = NODE_BY_ID[fac.building.node];
        fac.nodes = [...(fac.nodes ?? []), fac.building.node];
        if (teamId === s.userTeamId && node) msg(s, `${node.label} built`, `${FACILITY_LABEL[id]}: ${node.desc}`);
        fac.building = undefined;
      }
    }
  }
}
