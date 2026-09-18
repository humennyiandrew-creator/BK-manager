import { create } from 'zustand';

const STORAGE_KEY = 'bk-display-settings';

interface Persisted { reduceMotion: boolean }

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { reduceMotion: false, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { reduceMotion: false };
}

function persist(v: Persisted) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

function applyHtmlClass(v: boolean) {
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('reduce-motion', v);
}

const initial = load();
applyHtmlClass(initial.reduceMotion);

interface DisplaySettingsState extends Persisted {
  setReduceMotion: (v: boolean) => void;
}

export const useDisplaySettings = create<DisplaySettingsState>((set) => ({
  ...initial,
  setReduceMotion: (reduceMotion) => {
    set({ reduceMotion });
    persist({ reduceMotion });
    applyHtmlClass(reduceMotion);
  }
}));
