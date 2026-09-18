import type { SaveData, SaveMeta } from '../../electron/main/saves';

export interface BkApi {
  saveGame(slot: number, data: SaveData): Promise<void>;
  loadGame(slot: number): Promise<SaveData | null>;
  listSaves(): Promise<SaveMeta[]>;
  deleteSave(slot: number): Promise<void>;
}

export type { SaveData, SaveMeta };

declare global {
  interface Window {
    bk: BkApi;
  }
}
