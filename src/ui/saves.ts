import type { SaveData, SaveMeta } from '../types/bk';

export function saveGame(slot: number, data: SaveData): Promise<void> {
  return window.bk.saveGame(slot, data);
}

export function loadGame(slot: number): Promise<SaveData | null> {
  return window.bk.loadGame(slot);
}

export function listSaves(): Promise<SaveMeta[]> {
  return window.bk.listSaves();
}

export function deleteSave(slot: number): Promise<void> {
  return window.bk.deleteSave(slot);
}
