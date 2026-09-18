// Playbook data model. Plays are data: the live sim animates them, the fast sim uses their shot options.
import type { Attr } from '../ratings';

export type ShotType = 'rim' | 'mid' | 'three';

/** 1=PG 2=SG 3=SF 4=PF 5=C — lineup sorted by position. */
export type Role = 1 | 2 | 3 | 4 | 5;

/** Half-court frame in feet: baseline x=0, basket at (5.25, 25), half-court line x=47, sidelines y=0 / y=50. */
export interface Spot { x: number; y: number }

export interface PlayStep {
  t: number;                               // seconds
  move?: Partial<Record<Role, Spot>>;
  dribble?: Role;                          // ball handler moves with ball this step
  screen?: [Role, Role];                   // [screener, user]
  pass?: Role;                             // ball goes to role at end of step
  label?: string;                          // PBP flavour, e.g. "Horns set"
}

export interface PlayOption {
  role: Role | 'focus';                    // 'focus' = team focus player (iso plays)
  shot: ShotType;
  weight: number;
}

export type PlayCategory = 'pnr' | 'horns' | 'off-ball' | 'post' | 'iso' | 'motion' | 'transition' | 'zone-buster';

export interface Play {
  id: string;
  name: string;
  category: PlayCategory;
  desc: string;
  start: Record<Role, Spot>;
  steps: PlayStep[];
  options: PlayOption[];
  strongVs: DefScheme[];
  weakVs: DefScheme[];
  keyAttrs: Attr[];                        // what makes this play work (shown in UI)
}

export type OffSystem = 'motion' | 'pnr' | 'princeton' | 'triangle' | 'post' | 'seven' | 'iso';
export type DefScheme = 'man' | 'switch' | 'drop' | 'hedge' | 'blitz' | 'zone23' | 'zone32' | 'box1' | 'press';

export interface SystemDef {
  id: OffSystem;
  name: string;
  desc: string;
  plays: Record<string, number>;           // playId → base frequency
  pace: number;                            // added to tactics.pace
  threeMul: number;
  assistMul: number;
  toMul: number;
}

export interface SchemeDef {
  id: DefScheme;
  name: string;
  desc: string;
  rimD: number; midD: number; threeD: number; // added to defensive make-prob reduction (positive = better D)
  toMul: number; foulMul: number; drainMul: number;
  threeRateMul: number; rimRateMul: number;
  orbAllowed: number;                      // added to opponent offensive-rebound chance
  sag: number;                             // 0–1 how far off his man a defender sits (live positioning)
  zone?: Spot[];                           // zone anchor spots (live positioning), ordered by role
}
