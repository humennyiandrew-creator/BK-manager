// Shared data contracts. Engine + UI + data scripts all use these.

export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

export interface Team {
  id: string;            // NBA team id, e.g. "1610612747"
  abbr: string;          // "LAL"
  city: string;
  name: string;          // "Lakers"
  conference: 'East' | 'West';
  division: string;
  colors: { primary: string; secondary: string };
  logo: string;          // path relative to data/, e.g. "logos/LAL.svg"
  arenaCapacity: number;
}

export interface SeasonStats {
  season: string;        // "2025-26"
  team: string;          // abbr
  gp: number; gs: number; min: number;          // totals
  pts: number; orb: number; drb: number; ast: number; stl: number; blk: number; tov: number; pf: number;
  fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
  // advanced (nullable when unavailable)
  usg: number | null; per: number | null; bpm: number | null; obpm: number | null; dbpm: number | null;
}

export interface Contract {
  salaries: { season: string; amount: number }[]; // USD, from 2026-27 onward
  type: 'standard' | 'two-way' | 'rookie' | 'min';
  option?: { season: string; kind: 'player' | 'team' };
}

export interface RawPlayer {
  id: string;            // NBA person id (also headshot filename)
  firstName: string;
  lastName: string;
  teamId: string;
  jersey: string;
  positions: Position[];
  heightCm: number;
  weightKg: number;
  birthDate: string;     // ISO
  country: string;
  draft: { year: number; round: number; pick: number } | null;
  yearsPro: number;
  face: string | null;   // "faces/<id>.png" or null
  stats: SeasonStats[];  // last up to 3 seasons, newest first
  contract: Contract | null;
}
