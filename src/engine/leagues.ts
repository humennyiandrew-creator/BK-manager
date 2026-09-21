// League registry: rules, calendar, playoff format and economy per competition.
// NBA stays the default; EuroLeague (FIBA rules, 40-minute games) is the first non-NBA competition.
import type { Rules } from './sim/fast';

export type LeagueId = 'NBA' | 'EL';

export interface LeagueDef {
  id: LeagueId;
  name: string;
  short: string;
  rules: Rules;
  possSec: number;            // mean seconds per possession — sets the league's pace
  teams: number;
  gamesPerTeam: number;
  /** Regular-season window (month-day) in the season's calendar year offsets. */
  start: { month: number; day: number };
  end: { month: number; day: number };
  gameDays: number[];         // weekday numbers (0=Sun) the competition usually plays on
  playoff: 'nba' | 'el';
  economy: 'cap' | 'budget';  // cap = NBA CBA; budget = wage budget set by the board
  importLimit?: number;       // max non-domestic players (null = none)
  maxRoster: number;
  /** OVR offset applied when converting this league's stats into NBA-scale ratings. */
  strength: number;
}

export const NBA_RULES: Rules = { periods: 4, periodSec: 720, otSec: 300, foulOut: 6, bonusAt: 5 };
export const FIBA_RULES: Rules = { periods: 4, periodSec: 600, otSec: 300, foulOut: 5, bonusAt: 5 };

export const LEAGUES: Record<LeagueId, LeagueDef> = {
  NBA: {
    id: 'NBA', name: 'National Basketball Association', short: 'NBA',
    rules: NBA_RULES, possSec: 14.0, teams: 30, gamesPerTeam: 82,
    start: { month: 10, day: 20 }, end: { month: 4, day: 12 }, gameDays: [0, 1, 2, 3, 4, 5, 6],
    playoff: 'nba', economy: 'cap', maxRoster: 15, strength: 0,
  },
  EL: {
    id: 'EL', name: 'Turkish Airlines EuroLeague', short: 'EuroLeague',
    // FIBA: 40 minutes, foul out at 5, bonus from the 5th team foul. Slower: ~72 possessions.
    rules: FIBA_RULES, possSec: 15.7, teams: 20, gamesPerTeam: 38,
    start: { month: 10, day: 1 }, end: { month: 4, day: 10 }, gameDays: [2, 4], // Tue + Thu
    playoff: 'el', economy: 'budget', importLimit: undefined, maxRoster: 16, strength: -7,
  },
};

export const leagueOf = (id: string | undefined): LeagueDef => LEAGUES[(id as LeagueId) ?? 'NBA'] ?? LEAGUES.NBA;
