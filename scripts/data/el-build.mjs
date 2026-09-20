// Builds data/el/teams.json and data/el/players.json purely from the cache under
// data/raw/el/ (clubs, venues, people, per-player season stats). Run el-fetch.mjs
// first to populate/refresh that cache; this script does no network I/O itself
// except for downloading club crest images into data/logos/.
//
// Run directly: node scripts/data/el-build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '../..');
const RAW = path.join(ROOT, 'data/raw/el');
const OUT_DIR = path.join(ROOT, 'data/el');
const LOGOS_DIR = path.join(ROOT, 'data/logos');
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(LOGOS_DIR, { recursive: true });

const CURRENT = 'E2026'; // 2026-27 rosters
const SEASON_LABELS = { E2026: '2026-27', E2025: '2025-26', E2024: '2024-25' };
const STAT_SEASONS = ['E2025', 'E2024']; // newest first

function readJSON(rel) {
  return JSON.parse(fs.readFileSync(path.join(RAW, rel), 'utf8'));
}

const SUFFIX = { ii: 'II', iii: 'III', iv: 'IV', jr: 'Jr.', sr: 'Sr.' };
function titleCase(s) {
  return String(s)
    .toLowerCase()
    .replace(/(^|[\s\-'.])([a-z])/g, (_, sep, c) => sep + c.toUpperCase())
    // Generational suffixes read as names otherwise ("Wright Iv" -> "Wright IV").
    .split(/(\s+)/)
    .map((w) => SUFFIX[w.toLowerCase().replace('.', '')] ?? w)
    .join('')
    .trim();
}

function slugify(s) {
  return String(s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------
function buildTeams() {
  const clubs = readJSON(`clubs-${CURRENT}.json`).data;
  const venuesRaw = readJSON(`venues-${CURRENT}.json`);
  const venuesByClub = new Map((venuesRaw.data ?? venuesRaw).map((v) => [v.clubCode, v.venues]));

  const teams = clubs.map((c) => {
    const venues = venuesByClub.get(c.code) ?? [];
    const capacity = venues.length ? Math.max(...venues.map((v) => v.capacity || 0)) : 10000;
    return {
      id: `EL-${c.code}`,
      abbr: c.code,
      city: titleCase(c.city),
      name: c.abbreviatedName || c.name,
      league: 'EL',
      country: c.country?.name ?? '',
      conference: 'EL',
      division: 'EL',
      colors: { primary: c.primaryColor || '#1D1D1B', secondary: c.secondaryColor || '#FFFFFF' },
      logo: `logos/EL-${c.code}.png`,
      arenaCapacity: capacity,
    };
  });

  teams.sort((a, b) => a.abbr.localeCompare(b.abbr));
  fs.writeFileSync(path.join(OUT_DIR, 'teams.json'), JSON.stringify(teams, null, 2));
  console.log(`[el-build] wrote teams.json (${teams.length} clubs)`);
  return { teams, clubsRaw: clubs };
}

async function downloadLogos(clubsRaw) {
  let ok = 0, skipped = 0, failed = 0;
  for (const c of clubsRaw) {
    const file = path.join(LOGOS_DIR, `EL-${c.code}.png`);
    if (fs.existsSync(file)) { skipped++; continue; }
    const url = c.images?.crest;
    if (!url) { failed++; continue; }
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (BK-Manager data build script)' } });
      if (!res.ok) throw new Error(`${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(file, buf);
      ok++;
    } catch (e) {
      failed++;
      console.log(`[el-build] logo FAILED ${c.code}: ${e.message}`);
    }
  }
  console.log(`[el-build] logos: ${ok} downloaded, ${skipped} cached, ${failed} failed`);
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------
const POSITION_HEIGHT_SPLIT = { Guard: ['PG', 'SG', 193], Forward: ['SF', 'PF', 202] };

function mapPosition(positionName, heightCm) {
  if (positionName === 'Center') return ['C'];
  const rule = POSITION_HEIGHT_SPLIT[positionName];
  if (!rule) return ['SF'];
  const [lo, hi, threshold] = rule;
  return [heightCm < threshold ? lo : hi];
}

function estimateYearsPro(birthDate) {
  const today = new Date('2026-09-20');
  const born = new Date(birthDate);
  let age = today.getFullYear() - born.getFullYear();
  const m = today.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < born.getDate())) age--;
  return Math.max(0, age - 19);
}

function buildSeasonStats(personCode, season, teamAbbrFallback) {
  const file = path.join(RAW, 'stats', season, `${personCode}.json`);
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const acc = data.accumulated;
  if (!acc || !acc.gamesPlayed) return null;
  const lastGame = data.games?.[data.games.length - 1];
  const team = lastGame?.playerClubCode || teamAbbrFallback;
  return {
    season: SEASON_LABELS[season],
    team,
    gp: acc.gamesPlayed ?? 0,
    gs: acc.gamesStarted ?? acc.totalGamesStarted ?? 0,
    min: Math.round((acc.timePlayed ?? 0) / 60),
    pts: acc.points ?? 0,
    orb: acc.offensiveRebounds ?? 0,
    drb: acc.defensiveRebounds ?? 0,
    ast: acc.assistances ?? 0,
    stl: acc.steals ?? 0,
    blk: acc.blocksFavour ?? 0,
    tov: acc.turnovers ?? 0,
    pf: acc.foulsCommited ?? 0,
    fgm: acc.fieldGoalsMadeTotal ?? 0,
    fga: acc.fieldGoalsAttemptedTotal ?? 0,
    tpm: acc.fieldGoalsMade3 ?? 0,
    tpa: acc.fieldGoalsAttempted3 ?? 0,
    ftm: acc.freeThrowsMade ?? 0,
    fta: acc.freeThrowsAttempted ?? 0,
    usg: null, per: null, bpm: null, obpm: null, dbpm: null,
  };
}

function buildPlayers() {
  const people = readJSON(`people-${CURRENT}.json`).data;
  const active = people.filter((p) => p.typeName === 'Player' && p.active);

  const usedIds = new Set();
  const players = [];
  let withStats = 0;

  for (const p of active) {
    const person = p.person;
    const firstName = titleCase(person.passportName || person.name.split(',')[1] || '');
    const lastName = titleCase(person.passportSurname || person.name.split(',')[0] || '');
    const heightCm = person.height || 198;
    const weightKg = person.weight || 95;
    const birthDate = person.birthDate ? person.birthDate.slice(0, 10) : '2000-07-01';

    let id = `el-${slugify(firstName)}-${slugify(lastName)}`;
    if (usedIds.has(id)) id = `${id}-${person.code}`;
    usedIds.add(id);

    const stats = STAT_SEASONS
      .map((s) => buildSeasonStats(person.code, s, p.club.code))
      .filter(Boolean);
    if (stats.length) withStats++;

    players.push({
      id,
      firstName,
      lastName,
      teamId: `EL-${p.club.code}`,
      jersey: p.dorsalRaw || p.dorsal || '',
      positions: mapPosition(p.positionName, heightCm),
      heightCm,
      weightKg,
      birthDate,
      country: person.country?.name ?? '',
      draft: null,
      yearsPro: estimateYearsPro(birthDate),
      face: null,
      stats,
      contract: null,
    });
  }

  players.sort((a, b) => a.teamId.localeCompare(b.teamId) || a.lastName.localeCompare(b.lastName));
  fs.writeFileSync(path.join(OUT_DIR, 'players.json'), JSON.stringify(players, null, 2));
  console.log(`[el-build] wrote players.json (${players.length} players, ${withStats} with stats)`);
  return players;
}

async function main() {
  const { teams, clubsRaw } = buildTeams();
  await downloadLogos(clubsRaw);
  const players = buildPlayers();

  const perClub = new Map();
  for (const pl of players) perClub.set(pl.teamId, (perClub.get(pl.teamId) || 0) + 1);
  const counts = [...perClub.values()];
  console.log(`[el-build] summary: ${teams.length} clubs, ${players.length} players, per-club min ${Math.min(...counts)} max ${Math.max(...counts)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
