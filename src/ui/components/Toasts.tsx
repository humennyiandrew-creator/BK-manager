import { useEffect } from 'react';
import { create } from 'zustand';
import { play } from '../sound';
import styles from './Toasts.module.css';

export type ToastType = 'info' | 'success' | 'error';
interface ToastItem { id: number; text: string; type: ToastType }

interface ToastState {
  items: ToastItem[];
  push: (text: string, type: ToastType) => void;
  dismiss: (id: number) => void;
}

let seq = 0;
const useToastStore = create<ToastState>((set) => ({
  items: [],
  push: (text, type) => {
    const id = ++seq;
    set((s) => ({ items: [...s.items, { id, text, type }] }));
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) }))
}));

/** Global toast helper: toast('Saved', 'success'). Plays a matching sound. */
export function toast(text: string, type: ToastType = 'info') {
  useToastStore.getState().push(text, type);
  play(type === 'error' ? 'error' : type === 'success' ? 'confirm' : 'notify');
}

function ToastRow({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);
  useEffect(() => {
    const t = setTimeout(() => dismiss(item.id), 3200);
    return () => clearTimeout(t);
  }, [item.id, dismiss]);
  return (
    <div
      className={`${styles.toast} ${styles[item.type]} slide-in-right`}
      onClick={() => dismiss(item.id)}
    >
      {item.text}
    </div>
  );
}

/** Mount once near the app root. */
export default function Toasts() {
  const items = useToastStore((s) => s.items);
  if (!items.length) return null;
  return (
    <div className={styles.stack}>
      {items.map((t) => <ToastRow key={t.id} item={t} />)}
    </div>
  );
}
