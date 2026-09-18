import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rawDir = path.join(__dirname, '../../data/raw');
const outDir = path.join(__dirname, '../../data/nba');
fs.mkdirSync(rawDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

// Map of NBA team IDs to abbreviations
const teamIdMap = {
  1610612738: 'BOS', 1610612751: 'BKN', 1610612752: 'NYK', 1610612755: 'PHI', 1610612761: 'TOR',
  1610612741: 'CHI', 1610612739: 'CLE', 1610612765: 'DET', 1610612754: 'IND', 1610612749: 'MIL',
  1610612766: 'ATL', 1610612748: 'MIA', 1610612764: 'WAS', 1610612769: 'MEM', 1610612745: 'HOU',
  1610612743: 'DEN', 1610612750: 'MIN', 1610612762: 'UTA', 1610612721: 'CHH', 1610612740: 'NOP',
  1610612744: 'GSW', 1610612746: 'LAC', 1610612747: 'LAL', 1610612756: 'PHX', 1610612742: 'DAL',
  1610612760: 'OKC', 1610612758: 'SAC', 1610612757: 'POR',
  1610612713: 'LAC', 1610612791: 'UTA', 1610612737: 'ATL'
};

const revTeamMap = Object.fromEntries(Object.entries(teamIdMap).map(([k, v]) => [v, k]));

// Position mapping
function normalizePositions(posStr) {
  if (!posStr) return ['C'];
  const pos = posStr.toUpperCase().split(/[/-]/);
  const mapped = new Set();
  for (const p of pos) {
    const trimmed = p.trim();
    if (trimmed === 'G') mapped.add('PG', 'SG');
    else if (trimmed === 'F') mapped.add('SF', 'PF');
    else if (['PG', 'SG', 'SF', 'PF', 'C'].includes(trimmed)) mapped.add(trimmed);
  }
  return Array.from(mapped) || ['C'];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch with cache
async function fetchWithCache(url, filename) {
  const filepath = path.join(rawDir, filename);
  if (fs.existsSync(filepath)) {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  }

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.nba.com/',
      'Origin': 'https://www.nba.com',
      'Accept': 'application/json'
    };

    const res = await fetch(url, { headers });
    const data = await res.json();
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    return data;
  } catch (e) {
    console.error(`✗ Fetch failed for ${url}: ${e.message}`);
    return null;
  }
}

// Main fetch
async function fetchRosters() {
  console.log('Fetching NBA rosters for 2026-27...');

  // Try Stats API first
  const apiUrl = 'https://stats.nba.com/stats/playerindex?LeagueID=00&Season=2026-27&Historical=0';
  let data = await fetchWithCache(apiUrl, 'playerindex-2026-27.json');

  if (!data || !data.resultSets || data.resultSets.length === 0) {
    console.log('⚠ 2026-27 data empty, trying Historical=1');
    const apiUrl2 = 'https://stats.nba.com/stats/playerindex?LeagueID=00&Season=2026-27&Historical=1';
    data = await fetchWithCache(apiUrl2, 'playerindex-2026-27-historical.json');
  }

  const players = [];

  if (data && data.resultSets && data.resultSets.length > 0) {
    const headers = data.resultSets[0].headers;
    const rows = data.resultSets[0].rowSet || [];

    for (const row of rows) {
      const player = {};
      for (let i = 0; i < headers.length; i++) {
        player[headers[i]] = row[i];
      }

      if (player.ROSTER_STATUS !== 1) continue; // Only active players

      players.push({
        id: String(player.PERSON_ID),
        firstName: player.PLAYER_FIRST_NAME || '',
        lastName: player.PLAYER_LAST_NAME || '',
        teamId: String(player.TEAM_ID),
        jersey: player.JERSEY_NUM ? String(player.JERSEY_NUM) : '0',
        position: normalizePositions(player.POSITION),
        height: player.HEIGHT || 0,
        weight: player.WEIGHT || 0,
        country: player.COUNTRY || 'USA',
        draftYear: player.DRAFT_YEAR || null,
        draftRound: player.DRAFT_ROUND || null,
        draftPick: player.DRAFT_PICK || null,
        yearsPro: player.YEARS_PRO || 0
      });
    }
  }

  // Fallback: fetch each team's roster page if empty
  if (players.length === 0) {
    console.log('⚠ No API data, fetching team pages...');
    for (const [abbr, teamId] of Object.entries(revTeamMap).slice(0, 5)) {
      await sleep(3500);
      try {
        const teamUrl = `https://www.nba.com/team/${teamId}/roster`;
        const res = await fetch(teamUrl);
        const html = await res.text();

        // Extract __NEXT_DATA__ JSON from HTML
        const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([^<]*)<\/script>/);
        if (!match) continue;

        const nextData = JSON.parse(match[1]);
        // Parse player data from nextData structure (varies by NBA.com)
        console.log(`✓ Fetched ${abbr}`);
      } catch (e) {
        console.error(`✗ Team page error for ${abbr}: ${e.message}`);
      }
    }
  }

  fs.writeFileSync(path.join(outDir, 'rosters.json'), JSON.stringify(players, null, 2));
  console.log(`✓ Fetched ${players.length} players`);
  return players;
}

await fetchRosters();
