// Player development programmes: skill / position / physical / mental.
import type { DevProgram, GameState, Player, ProgramKind } from './model';
import type { Attr } from './ratings';
import { ageOf } from './ratings';
import type { Position } from './types';
import { hashString, mulberry32, type Rng } from './rng';
import { daysBetween } from './schedule';
import { staffRating } from './mgmt/staff';
import { facilityLevel } from './mgmt/facilities';
import { FOCUS_ATTRS } from './progression';
import { clamp } from './mgmt/market';

const MAX_ACTIVE = 3;
const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const POS_ADJ: Record<Position, Position[]> = { PG: ['SG'], SG: ['PG', 'SF'], SF: ['SG', 'PF'], PF: ['SF', 'C'], C: ['PF'] };
const PHYSICAL: Attr[] = ['speed', 'strength', 'vertical', 'stamina'];
const MENTAL: Attr[] = ['offIQ', 'helpD', 'clutch'];
const SKILL_FOCI: ('shooting' | 'finishing' | 'playmaking' | 'defense' | 'rebounding')[] = ['shooting', 'finishing', 'playmaking', 'defense', 'rebounding'];

function isAttr(t: Attr | Position): t is Attr {
  return !(POSITIONS as string[]).includes(t);
}

function weakest(attrs: Player['ratings']['attrs'], pool: Attr[]): Attr {
  return [...pool].sort((a, b) => attrs[a] - attrs[b])[0];
}

function weeklyTick(s: GameState): boolean {
  const d = daysBetween(`${s.seasonYear}-10-01`, s.date);
  return d > 0 && d % 7 === 0;
}

function msg(s: GameState, subject: string, body: string) {
  s.messages.unshift({ id: s.nextId++, date: s.date, from: 'Player Development', subject, body, read: false, kind: 'other' });
}

export interface ProgramOption { kind: ProgramKind; label: string; target: Attr | Position; weeks: number; weeklyFatigue: number; risk: number; expectedGain: number }

/** Candidate development programmes for a player, with weeks/risk/expected gain shown before commit. */
export function availablePrograms(s: GameState, playerId: string): ProgramOption[] {
  const p = s.players[playerId];
  if (!p) return [];
  const age = ageOf(p.birthDate, new Date(s.date));
  const rng = mulberry32(hashString(`${s.seed}|progopt|${playerId}|${s.date}`));
  const youthMul = age <= 23 ? 1.25 : age <= 27 ? 1 : age <= 30 ? 0.7 : 0.45;
  const workMul = 0.8 + p.ratings.personality.workEthic / 40;

  const mkOpt = (kind: ProgramKind, label: string, target: Attr | Position, riskBase: number): ProgramOption => {
    const weeks = 6 + Math.floor(rng() * 7);
    const ageRisk = Math.max(0, age - 28) * 0.015;
    const risk = clamp(riskBase + ageRisk + rng() * 0.06, 0, 0.3);
    const gain = clamp((2 + rng() * 4) * youthMul * workMul, 1, 9);
    return { kind, label, target, weeks, weeklyFatigue: +(3 + rng() * 4).toFixed(1), risk: +risk.toFixed(2), expectedGain: +gain.toFixed(1) };
  };

  const opts: ProgramOption[] = [];
  for (const focus of SKILL_FOCI) {
    const pool = FOCUS_ATTRS[focus];
    if (!pool.length) continue;
    const attr = weakest(p.ratings.attrs, pool);
    opts.push(mkOpt('skill', `Skill work: ${attr}`, attr, 0.05));
  }
  const newPos = POS_ADJ[p.positions[0]]?.find((x) => !p.positions.includes(x));
  if (newPos) opts.push(mkOpt('position', `Learn ${newPos}`, newPos, 0.15));
  opts.push(mkOpt('physical', `Physical: ${weakest(p.ratings.attrs, PHYSICAL)}`, weakest(p.ratings.attrs, PHYSICAL), 0.05));
  opts.push(mkOpt('mental', `Mental: ${weakest(p.ratings.attrs, MENTAL)}`, weakest(p.ratings.attrs, MENTAL), 0.04));
  return opts;
}

/** Commit a player to a programme. One per player, max 3 active per team. */
export function startProgram(s: GameState, playerId: string, option: ProgramOption): string | null {
  const p = s.players[playerId];
  if (!p || !p.teamId) return 'Player not found';
  if (p.program) return 'Already in a development programme';
  const teamId = p.teamId;
  const active = Object.values(s.players).filter((x) => x.teamId === teamId && x.program).length;
  if (active >= MAX_ACTIVE) return 'Maximum of 3 active programmes for this team';
  const cost = Math.round((80_000 + option.weeks * 12_000) * (option.kind === 'position' ? 1.4 : 1));
  if (s.finance.cash < cost) return 'Not enough cash for this programme';
  s.finance.cash -= cost;
  s.finance.expense.staff += cost;
  const program: DevProgram = { kind: option.kind, label: option.label, target: option.target, weeksLeft: option.weeks, weeksTotal: option.weeks, progress: 0, risk: option.risk };
  p.program = program;
  msg(s, `${p.firstName} ${p.lastName} starts a programme`, `${option.label} — ${option.weeks} weeks, ${Math.round(option.risk * 100)}% setback risk.`);
  return null;
}

function applyOutcome(s: GameState, p: Player, prog: DevProgram, kind: 'success' | 'partial' | 'setback', rng: Rng): void {
  const name = `${p.firstName} ${p.lastName}`;
  if (isAttr(prog.target)) {
    const attr = prog.target;
    if (kind === 'success') {
      const gain = Math.round(3 + rng() * 4);
      p.ratings.attrs[attr] = Math.round(clamp(p.ratings.attrs[attr] + gain, 25, 99));
      msg(s, `${name} completes ${prog.label}`, `Successful programme — ${attr} up ${gain}.`);
    } else if (kind === 'partial') {
      const gain = Math.round(1 + rng() * 2);
      p.ratings.attrs[attr] = Math.round(clamp(p.ratings.attrs[attr] + gain, 25, 99));
      msg(s, `${name} finishes ${prog.label}`, `Partial progress — ${attr} up ${gain}.`);
    } else {
      const loss = Math.round(1 + rng() * 2);
      p.ratings.attrs[attr] = Math.round(clamp(p.ratings.attrs[attr] - loss, 25, 99));
      p.morale = Math.round(clamp(p.morale - 6, 0, 100));
      msg(s, `${name} has a setback`, `${prog.label} didn't go well — ${attr} down ${loss}, morale dipped.`);
    }
    return;
  }
  const pos = prog.target;
  if (kind === 'success' || (kind === 'partial' && rng() < 0.5)) {
    if (!p.positions.includes(pos)) p.positions.push(pos);
    msg(s, `${name} adds a new position`, `${name} can now play ${pos}.`);
  } else if (kind === 'setback') {
    p.morale = Math.round(clamp(p.morale - 4, 0, 100));
    msg(s, `${name}'s position work stalls`, `The move to ${pos} didn't take. He'll keep working on it.`);
  } else {
    msg(s, `${name}'s position work is incomplete`, `Progress toward ${pos}, but not enough to add it yet.`);
  }
}

/** Weekly (same cadence as progression): progress active programmes, resolve completions. */
export function programsWeekly(s: GameState): void {
  if (!weeklyTick(s)) return;
  for (const p of Object.values(s.players)) {
    if (!p.teamId || !p.program || p.retired) continue;
    const prog = p.program;
    const dev = staffRating(s, p.teamId, 'development') / 100;
    const fac = facilityLevel(s, p.teamId, 'training') / 5;
    const work = p.ratings.personality.workEthic / 20;
    const fatiguePenalty = clamp(1 - (p.fatigue ?? 0) / 150, 0.5, 1);
    const weeklyPct = (100 / prog.weeksTotal) * (0.55 + 0.45 * (0.4 * dev + 0.3 * fac + 0.3 * work)) * fatiguePenalty;
    prog.progress = Math.min(100, prog.progress + weeklyPct);
    prog.weeksLeft = Math.max(0, prog.weeksLeft - 1);
    if (prog.weeksLeft > 0 && prog.progress < 100) continue;

    const rng = mulberry32(hashString(`${s.seed}|progdone|${p.id}|${s.date}`));
    const roll = rng();
    const outcome = roll < prog.risk ? 'setback' : roll < prog.risk + 0.2 ? 'partial' : 'success';
    applyOutcome(s, p, prog, outcome, rng);
    p.program = undefined;
  }
}
