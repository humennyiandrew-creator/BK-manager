import { create } from 'zustand';
import type { GameState } from '../../engine/model';
import { newGame } from '../../engine/world';
import { continueGame, userGameToday } from '../../engine/season';
import type { SaveData } from '../../types/bk';
import { loadGame, saveGame } from '../saves';
import { loadLeagueData } from '../loadData';

/** Sim the user's game today. Placeholder for the live 2D match, which will replace this call. */
function playUserMatch(s: GameState) {
  continueGame(s);
}

function toSaveData(s: GameState): SaveData {
  const team = s.teams[s.userTeamId];
  return { teamName: `${team.city} ${team.name}`, date: s.date, state: s };
}

interface GameStore {
  s: GameState | null;
  rev: number;
  slot: number | null;
  busy: boolean;
  mutate: (fn: (s: GameState) => void) => void;
  startNew: (teamId: string, slot: number) => Promise<void>;
  load: (slot: number) => Promise<boolean>;
  save: () => Promise<void>;
  continue: () => void;
  reset: () => void;
}

export const useGame = create<GameStore>((set, get) => ({
  s: null,
  rev: 0,
  slot: null,
  busy: false,

  mutate: (fn) => {
    const { s } = get();
    if (!s) return;
    fn(s);
    set((st) => ({ rev: st.rev + 1 }));
  },

  startNew: async (teamId, slot) => {
    set({ busy: true });
    const { teams, players } = await loadLeagueData();
    const seed = Date.now() % 0x7fffffff;
    const s = newGame(teams, players, teamId, seed);
    set({ s, slot, rev: 0, busy: false });
    await saveGame(slot, toSaveData(s));
  },

  load: async (slot) => {
    set({ busy: true });
    const data = await loadGame(slot);
    if (!data || !data.state) {
      set({ busy: false });
      return false;
    }
    set({ s: data.state as GameState, slot, rev: 0, busy: false });
    return true;
  },

  save: async () => {
    const { s, slot } = get();
    if (!s || slot == null) return;
    await saveGame(slot, toSaveData(s));
  },

  continue: () => {
    const { s, slot, busy } = get();
    if (!s || busy) return;
    set({ busy: true });
    setTimeout(() => {
      if (userGameToday(s)) playUserMatch(s);
      else continueGame(s);
      set((st) => ({ rev: st.rev + 1, busy: false }));
      if (slot != null) void saveGame(slot, toSaveData(s));
    }, 30);
  },

  reset: () => set({ s: null, rev: 0, slot: null, busy: false })
}));

/** Subscribes to `rev` so the component re-renders after in-place engine mutations, then returns the state. */
export function useGameState(): GameState | null {
  useGame((st) => st.rev);
  return useGame((st) => st.s);
}
