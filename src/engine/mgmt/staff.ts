// Coaching & front-office staff.
import type { GameState, Staff, StaffRole } from '../model';
import { hashString, mulberry32 } from '../rng';
import { clamp, marketFactor, teamStrength } from './market';
import { standings } from '../season';
import { daysBetween } from '../schedule';

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

// ---------- C: staff development ----------

export interface StaffCourse { name: string; weeks: number; cost: number; gain: number }

/** 2-3 course options for a staffer: cost/weeks scale with rating gain and the staffer's own level. */
export function staffCourses(s: GameState, staffId: string): StaffCourse[] {
  const st = s.staff.find((x) => x.id === staffId);
  if (!st) return [];
  const rng = mulberry32(hashString(`${s.seed}|course|${staffId}`));
  const names = ['Weekend Clinic', 'Regional Certification', 'Advanced Coaching Course'];
  const opts: StaffCourse[] = [];
  const n = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < Math.min(n, 3); i++) {
    const gain = 2 + Math.floor(rng() * 4); // 2-5
    const weeks = 2 + Math.floor(rng() * 5); // 2-6
    const cost = Math.round((gain * 60_000 + weeks * 20_000) * (1 + rng() * 0.3) / 5_000) * 5_000;
    opts.push({ name: `${names[i % names.length]}`, weeks, cost, gain });
  }
  return opts;
}

export function enrollStaff(s: GameState, staffId: string, course: StaffCourse): string | null {
  const st = s.staff.find((x) => x.id === staffId);
  if (!st) return 'Staff member not found';
  if (st.teamId !== s.userTeamId) return 'Not on your staff';
  if (st.course) return 'Already enrolled in a course';
  if (s.finance.cash < course.cost) return 'Not enough cash';
  s.finance.cash -= course.cost;
  st.course = { name: course.name, weeksLeft: course.weeks, gain: course.gain, cost: course.cost };
  msg(s, `${st.name} enrolled`, `${st.name} is enrolled in ${course.name} (${course.weeks} weeks, +${course.gain} rating on completion).`);
  return null;
}

const XP_PER_LEVEL = 100;

/** Weekly (every 7th day from Oct 1): staff gain xp from usage/results; courses tick down. */
export function staffWeekly(s: GameState): void {
  const d = daysBetween(`${s.seasonYear}-10-01`, s.date);
  if (d <= 0 || d % 7 !== 0) return;
  const winPct = standings(s, s.teams[s.userTeamId].conference).find((r) => r.teamId === s.userTeamId)?.pct ?? 0.5;
  const rng = mulberry32(hashString(`${s.seed}|staffxp|${s.date}`));
  for (const st of s.staff) {
    if (!st.teamId) continue;
    const resultBonus = st.teamId === s.userTeamId ? Math.round((winPct - 0.5) * 6) : 0;
    st.xp = (st.xp ?? 0) + Math.max(1, 3 + resultBonus + Math.round(rng() * 2));
    if (st.rating < 99 && (st.xp ?? 0) >= XP_PER_LEVEL) {
      st.xp -= XP_PER_LEVEL;
      st.rating = Math.min(99, st.rating + 1);
      if (st.teamId === s.userTeamId) msg(s, `${st.name} improves`, `${ROLE_LABEL[st.role]} ${st.name} has developed — rating now ${st.rating}.`);
    }
    if (st.course) {
      st.course.weeksLeft -= 1;
      if (st.course.weeksLeft <= 0) {
        st.rating = Math.min(99, st.rating + st.course.gain);
        if (st.teamId === s.userTeamId) msg(s, `${st.name} completes course`, `${st.name} finished ${st.course.name}: +${st.course.gain} rating (now ${st.rating}).`);
        st.course = undefined;
      }
    }
  }
}
