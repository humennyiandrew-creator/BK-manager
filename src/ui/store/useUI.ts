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

export type AppView = 'startMenu' | 'chooseTeam' | 'shell';

interface UIState {
  view: AppView;
  tab: TabId;
  setView: (view: AppView) => void;
  setTab: (tab: TabId) => void;
}

export const useUI = create<UIState>((set) => ({
  view: 'startMenu',
  tab: 'home',
  setView: (view) => set({ view }),
  setTab: (tab) => set({ tab })
}));
