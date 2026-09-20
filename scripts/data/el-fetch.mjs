// Shared fetch-with-cache helper for EuroLeague data scripts, plus a direct-run
// mode that populates data/raw/el/ from the live feeds so the other el-*.mjs
// scripts can build purely from cache (reruns are then free / offline).
//
// Sources (tried in order, per club/player as needed):
//   1. https://feeds.incrowdsports.com/provider/euroleague-feeds/v2/...  (JSON, works well: clubs, venues, people, roster)
//   2. https://api-live.euroleague.net/v2/...                            (JSON, works well: per-player box-score stats)
// Both hosts responded 200 with usable JSON as of 2026-09-20, so sources 2/3
// from the task brief (NEXT_DATA scraping, realgm) were not needed.
//
// Run directly: node scripts/data/el-fetch.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const RAW = path.join(ROOT, 'data/raw/el');
fs.mkdirSync(RAW, { recursive: true });

const UA = 'Mozilla/5.0 (BK-Manager data build script; contact: local dev)';
const MIN_GAP_MS = 1100; // politeness: >=1s between requests to the same host
const lastRequestAt = new Map(); // host -> timestamp

async function politeDelay(host) {
  const last = lastRequestAt.get(host) ?? 0;
  const wait = last + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt.set(host, Date.now());
}

// Fetches `url` as JSON, caching the raw response body under data/raw/el/<cacheRelPath>.
// Skips the network entirely when the cache file already exists.
export async function fetchCachedJSON(url, cacheRelPath) {
  const file = path.join(RAW, cacheRelPath);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const host = new URL(url).host;
  await politeDelay(host);
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const text = await res.text();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return JSON.parse(text);
}

const FEEDS = 'https://feeds.incrowdsports.com/provider/euroleague-feeds/v2/competitions/E';
const LIVE = 'https://api-live.euroleague.net/v2/competitions/E';

export const urls = {
  clubs: (seasonCode) => `${FEEDS}/seasons/${seasonCode}/clubs`,
  venues: (seasonCode) => `${FEEDS}/seasons/${seasonCode}/venues`,
  people: (seasonCode) => `${FEEDS}/seasons/${seasonCode}/people?limit=1000`,
  playerStats: (seasonCode, personCode) => `${LIVE}/seasons/${seasonCode}/people/${encodeURIComponent(personCode)}/stats`,
};

export async function fetchAll() {
  const CURRENT = 'E2026'; // 2026-27 preseason rosters
  const STAT_SEASONS = ['E2025', 'E2024']; // 2025-26 (required) + 2024-25 (bonus, "if easy")

  console.log('[el-fetch] clubs/venues/roster for', CURRENT);
  const clubs = await fetchCachedJSON(urls.clubs(CURRENT), `clubs-${CURRENT}.json`);
  await fetchCachedJSON(urls.venues(CURRENT), `venues-${CURRENT}.json`);
  const people = await fetchCachedJSON(urls.people(CURRENT), `people-${CURRENT}.json`);

  const players = people.data.filter((p) => p.typeName === 'Player' && p.active);
  console.log(`[el-fetch] ${clubs.data.length} clubs, ${players.length} active players`);

  let fetched = 0, cached = 0, failed = 0;
  for (const season of STAT_SEASONS) {
    for (const p of players) {
      const code = p.person.code;
      const rel = `stats/${season}/${code}.json`;
      const file = path.join(RAW, rel);
      if (fs.existsSync(file)) { cached++; continue; }
      try {
        await fetchCachedJSON(urls.playerStats(season, code), rel);
        fetched++;
      } catch (e) {
        failed++;
        console.log(`[el-fetch] FAILED ${season} ${code} (${p.person.name}): ${e.message}`);
      }
    }
    console.log(`[el-fetch] ${season}: done (running totals — fetched ${fetched}, cached ${cached}, failed ${failed})`);
  }
  console.log({ fetched, cached, failed });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await fetchAll();
}
