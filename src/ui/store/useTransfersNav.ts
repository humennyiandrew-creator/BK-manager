// Tiny bridge so other screens can ask TransfersScreen to open on a given sub-tab.
import { create } from 'zustand';

export type TransfersSubTab = 'trade' | 'offers' | 'fa' | 'tx';

interface State {
  jumpTo: TransfersSubTab | null;
  requestTab: (tab: TransfersSubTab) => void;
  clear: () => void;
}

export const useTransfersNav = create<State>((set) => ({
  jumpTo: null,
  requestTab: (tab) => set({ jumpTo: tab }),
  clear: () => set({ jumpTo: null })
}));
