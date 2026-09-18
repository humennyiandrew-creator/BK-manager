import { app } from 'electron';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export interface SaveData {
  teamName: string;
  date: string;
  [key: string]: unknown;
}

interface SaveFile {
  savedAt: string;
  data: SaveData;
}

export interface SaveMeta {
  slot: number;
  teamName: string;
  date: string;
  savedAt: string;
}

function savesDir(): string {
  const dir = join(app.getPath('userData'), 'saves');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function slotPath(slot: number): string {
  return join(savesDir(), `slot${slot}.json.gz`);
}

export async function saveGame(slot: number, data: SaveData): Promise<void> {
  const file: SaveFile = { savedAt: new Date().toISOString(), data };
  const buf = await gzipAsync(Buffer.from(JSON.stringify(file), 'utf-8'));
  await writeFile(slotPath(slot), buf);
}

export async function loadGame(slot: number): Promise<SaveData | null> {
  const path = slotPath(slot);
  if (!existsSync(path)) return null;
  const raw = await readFile(path);
  const json = await gunzipAsync(raw);
  const file = JSON.parse(json.toString('utf-8')) as SaveFile;
  return file.data;
}

export async function listSaves(): Promise<SaveMeta[]> {
  const results: SaveMeta[] = [];
  for (let slot = 1; slot <= 5; slot++) {
    const path = slotPath(slot);
    if (!existsSync(path)) continue;
    try {
      const raw = await readFile(path);
      const json = await gunzipAsync(raw);
      const file = JSON.parse(json.toString('utf-8')) as SaveFile;
      results.push({ slot, teamName: file.data.teamName, date: file.data.date, savedAt: file.savedAt });
    } catch {
      // corrupt save, skip
    }
  }
  return results;
}

export async function deleteSave(slot: number): Promise<void> {
  const path = slotPath(slot);
  if (existsSync(path)) await unlink(path);
}
