// Coaching & front-office staff.
import type { GameState, Staff, StaffRole } from '../model';
import { hashString, mulberry32 } from '../rng';
import { clamp, marketFactor, teamStrength } from './market';

export const ROLES: StaffRole[] = ['assistantOff', 'assistantDef', 'development', 'medical', 'scout', 'analytics'];
export const ROLE_LABEL: Record<StaffRole, string> = {
  assistantOff: 'Offensive Coordinator',
  assistantDef: 'Defensive Coordinator',
  development: 'Player Development Coach',
  medical: 'Head Athletic Trainer',
  scout: 'Chief Scout',
  analytics: 'Director of Analytics',
};

const FIRST = ['James', 'Michael', 'David', 'Robert', 'John', 'Chris', 'Marcus', 'Anthony', 'Kevin', 'Brian', 'Steve', 'Mark', 'Paul', 'Andre', 'Derek', 'Eric', 'Tyler', 'Jordan', 'Sean', 'Greg', 'Tony', 'Keith', 'Craig', 'Dennis', 'Victor', 'Aaron', 'Wesley', 'Phillip', 'Nathan', 'Carl'];
const LAST = ['Johnson', 'Williams', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin', 'Thompson', 'Garcia', 'Martinez', 'Robinson', 'Clark', 'Rodriguez', 'Lewis', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Hill', 'Green'];

function makeStaff(rng: () => number, id: string, role: StaffRole, rating: number, teamId: string | null): Staff {
  const age = 30 + Math.floor(rng() * 36);
  const salary = Math.round((400_000 + ((clamp(rating, 35, 90) - 35) / 55) * 3_600_000 + rng() * 200_000) / 10_000) * 10_000;
  const years = 1 + Math.floor(rng() * 4);
  const name = `${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`;
  return { id, name, role, rating: Math.round(rating), age, salary, years, teamId };
}

export function initStaff(s: GameState): void {
  const rng = mulberry32(hashString(`${s.seed}|staff`));
  let n = 0;
  for (const team of Object.values(s.teams)) {
    const strengthNorm = clamp((teamStrength(s, team.id) - 65) / 25, 0, 1);
    const marketNorm = clamp((marketFactor(team.abbr) - 0.8) / 0.7, 0, 1);
    const bias = 0.6 * strengthNorm + 0.4 * marketNorm;
    for (const role of ROLES) {
      const base = 35 + rng() * 55;
      const rating = clamp(base + bias * 10, 35, 90);
      s.staff.push(makeStaff(rng, `st${n++}`, role, rating, team.id));
    }
  }
  for (let i = 0; i < 30; i++) {
    const role = ROLES[Math.floor(rng() * ROLES.length)];
    const rating = clamp(35 + rng() * 50, 35, 88);
    s.staff.push(makeStaff(rng, `st${n++}`, role, rating, null));
  }
}

/** Rating 1-100 of the team's staffer in that role; 40 if vacant. */
export function staffRating(s: GameState, teamId: string, role: StaffRole): number {
  return s.staff.find((x) => x.teamId === teamId && x.role === role)?.rating ?? 40;
}

export const STAFF_BUDGET = 18_000_000;

function msg(s: GameState, subject: string, body: string) {
  s.messages.unshift({ id: s.nextId++, date: s.date, from: 'Front Office', subject, body, read: false, kind: 'staff' });
}

export function hireStaff(s: GameState, staffId: string, years: number): string | null {
  const hire = s.staff.find((x) => x.id === staffId);
  if (!hire) return 'Staff member not found';
  const teamId = s.userTeamId;
  if (hire.teamId === teamId) return 'Already on staff';
  const current = s.staff.filter((x) => x.teamId === teamId);
  const incumbent = current.find((x) => x.role === hire.role);
  const total = current.reduce((sum, x) => sum + x.salary, 0) - (incumbent?.salary ?? 0) + hire.salary;
  const cap = STAFF_BUDGET * s.board.budgetMul;
  if (total > cap) return `Over staff budget (limit $${(cap / 1e6).toFixed(1)}M)`;

  if (incumbent) {
    const payout = incumbent.salary * incumbent.years;
    incumbent.teamId = null;
    s.finance.cash -= payout;
    s.finance.expense.staff += payout;
    msg(s, `${incumbent.name} let go`, `${ROLE_LABEL[incumbent.role]} released, paid out $${(payout / 1e6).toFixed(1)}M remaining on his deal.`);
  }
  hire.teamId = teamId;
  hire.years = years;
  msg(s, `${hire.name} hired`, `Hired as ${ROLE_LABEL[hire.role]} (${years}yr, $${(hire.salary / 1e6).toFixed(1)}M/yr).`);
  return null;
}

export function fireStaff(s: GameState, staffId: string): string | null {
  const staffer = s.staff.find((x) => x.id === staffId);
  if (!staffer) return 'Staff member not found';
  if (!staffer.teamId) return 'Already unemployed';
  const payout = staffer.salary * staffer.years;
  if (staffer.teamId === s.userTeamId) {
    s.finance.cash -= payout;
    s.finance.expense.staff += payout;
  }
  msg(s, `${staffer.name} released`, `${ROLE_LABEL[staffer.role]} released, paid out $${(payout / 1e6).toFixed(1)}M remaining on his deal.`);
  staffer.teamId = null;
  return null;
}
