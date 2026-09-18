import { contextBridge, ipcRenderer } from 'electron';
import type { SaveData, SaveMeta } from '../main/saves';

const bkApi = {
  saveGame: (slot: number, data: SaveData): Promise<void> => ipcRenderer.invoke('bk:saveGame', slot, data),
  loadGame: (slot: number): Promise<SaveData | null> => ipcRenderer.invoke('bk:loadGame', slot),
  listSaves: (): Promise<SaveMeta[]> => ipcRenderer.invoke('bk:listSaves'),
  deleteSave: (slot: number): Promise<void> => ipcRenderer.invoke('bk:deleteSave', slot)
};

contextBridge.exposeInMainWorld('bk', bkApi);

export type BkApi = typeof bkApi;
