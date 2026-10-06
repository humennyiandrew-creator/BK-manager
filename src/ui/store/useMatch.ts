// Non-persisted store for the live 2D match: the LiveMatch instance mutates itself internally
// (see engine/sim/live.ts), so this store just tracks identity + UI-only knobs (speed/paused).
import { create } from 'zustand';
import type { Game, GameState } from '../../engine/model';
import { LiveMatch } from '../../engine/sim/live';
import { hashString } from '../../engine/rng';
import { leagueOf } from '../../engine/leagues';

interface MatchStore {
  match: LiveMatch | null;
  game: Game | null;
  speed: number;
  paused: boolean;
  rev: number;
  start: (s: GameState, game: Game) => void;
  setSpeed: (speed: number) => void;
  setPaused: (paused: boolean) => void;
  bump: () => void;
  clear: () => void;
}

export const useMatch = create<MatchStore>((set) => ({
  match: null,
  game: null,
  speed: 5,
  paused: false,
  rev: 0,

  start: (s, game) => {
    const userSide: 0 | 1 = game.home === s.userTeamId ? 0 : 1;
    const seed = hashString(`${s.seed}|${game.id}`);
    // Each competition plays its own rules: EuroLeague games are 40-minute FIBA games, live too.
    const league = leagueOf(game.comp ?? s.teams[game.home].league);
    const match = new LiveMatch(s.teams[game.home], s.teams[game.away], s.players, seed, userSide, { ...league.rules, possSec: league.possSec });
    set({ match, game, speed: 5, paused: false, rev: 0 });
  },
  setSpeed: (speed) => set({ speed }),
  setPaused: (paused) => set({ paused }),
  bump: () => set((st) => ({ rev: st.rev + 1 })),
  clear: () => set({ match: null, game: null, rev: 0 })
}));
