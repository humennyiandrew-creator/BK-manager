// Tiny bridge so MessagesScreen can ask TransfersScreen to open on the Offers sub-tab.
import { create } from 'zustand';

interface State {
  jumpToOffers: boolean;
  requestOffers: () => void;
  clear: () => void;
}

export const useTransfersNav = create<State>((set) => ({
  jumpToOffers: false,
  requestOffers: () => set({ jumpToOffers: true }),
  clear: () => set({ jumpToOffers: false })
}));
