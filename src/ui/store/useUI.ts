import { create } from 'zustand';

export const TAB_IDS = [
  'home',
  'messages',
  'calendar',
  'roster',
  'squadHub',
  'training',
  'playbook',
  'transfers',
  'draft',
  'staff',
  'facilities',
  'board',
  'finances',
  'standings',
  'settings'
] as const;

export type TabId = (typeof TAB_IDS)[number];

export type AppView = 'startMenu' | 'chooseTeam' | 'shell' | 'match';

interface UIState {
  view: AppView;
  tab: TabId;
  pendingSlot: number | null;
  activeEventId: string | null;
  playerId: string | null;
  setView: (view: AppView) => void;
  setTab: (tab: TabId) => void;
  setPendingSlot: (slot: number | null) => void;
  openEvent: (id: string) => void;
  closeEvent: () => void;
  openPlayer: (id: string) => void;
  closePlayer: () => void;
}

export const useUI = create<UIState>((set) => ({
  view: 'startMenu',
  tab: 'home',
  pendingSlot: null,
  activeEventId: null,
  playerId: null,
  setView: (view) => set({ view }),
  setTab: (tab) => set({ tab }),
  setPendingSlot: (pendingSlot) => set({ pendingSlot }),
  openEvent: (activeEventId) => set({ activeEventId }),
  closeEvent: () => set({ activeEventId: null }),
  openPlayer: (playerId) => set({ playerId }),
  closePlayer: () => set({ playerId: null })
}));
