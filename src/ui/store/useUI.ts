import { create } from 'zustand';

export const TAB_IDS = [
  'home',
  'career',
  'messages',
  'calendar',
  'roster',
  'squadHub',
  'training',
  'playbook',
  'locker',
  'transfers',
  'draft',
  'staff',
  'facilities',
  'board',
  'finances',
  'standings',
  'league',
  'settings'
] as const;

export type TabId = (typeof TAB_IDS)[number];

export type AppView = 'startMenu' | 'chooseTeam' | 'shell' | 'match';

const NAV_KEY = 'bk-nav-collapsed';
const loadCollapsed = () => { try { return localStorage.getItem(NAV_KEY) === '1'; } catch { return false; } };

interface UIState {
  view: AppView;
  tab: TabId;
  pendingSlot: number | null;
  activeEventId: string | null;
  playerId: string | null;
  navCollapsed: boolean;
  setView: (view: AppView) => void;
  setTab: (tab: TabId) => void;
  setPendingSlot: (slot: number | null) => void;
  openEvent: (id: string) => void;
  closeEvent: () => void;
  openPlayer: (id: string) => void;
  closePlayer: () => void;
  toggleNav: () => void;
}

export const useUI = create<UIState>((set) => ({
  view: 'startMenu',
  tab: 'home',
  pendingSlot: null,
  activeEventId: null,
  playerId: null,
  navCollapsed: loadCollapsed(),
  setView: (view) => set({ view }),
  setTab: (tab) => set({ tab }),
  setPendingSlot: (pendingSlot) => set({ pendingSlot }),
  openEvent: (activeEventId) => set({ activeEventId }),
  closeEvent: () => set({ activeEventId: null }),
  openPlayer: (playerId) => set({ playerId }),
  closePlayer: () => set({ playerId: null }),
  toggleNav: () => set((st) => {
    const navCollapsed = !st.navCollapsed;
    try { localStorage.setItem(NAV_KEY, navCollapsed ? '1' : '0'); } catch { /* ignore */ }
    return { navCollapsed };
  })
}));
