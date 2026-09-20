// Tiny bridge so other screens can ask BoardScreen to open on a given sub-tab.
import { create } from 'zustand';

export type BoardSubTab = 'overview' | 'meeting' | 'promises' | 'media';

interface State {
  jumpTo: BoardSubTab | null;
  requestTab: (tab: BoardSubTab) => void;
  clear: () => void;
}

export const useBoardNav = create<State>((set) => ({
  jumpTo: null,
  requestTab: (tab) => set({ jumpTo: tab }),
  clear: () => set({ jumpTo: null })
}));
