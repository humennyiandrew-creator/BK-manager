// Build data/nba/teams.json + players.json from cached raw sources in data/raw.
// Also downloads missing faces and (re)downloads all 30 logos.
// Run: node scripts/data/build.mjs [--logos]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const RAW = path.join(ROOT, 'data/raw');
const OUT = path.join(ROOT, 'data/nba');
fs.mkdirSync(OUT, { recursive: true });

// abbr: [conference, division, primary, secondary, arenaCapacity]
const META = {
  ATL: ['East', 'Southeast', '#E03A3E', '#C1D32F', 17044], BOS: ['East', 'Atlantic', '#007A33', '#BA9653', 19156],
  BKN: ['East', 'Atlantic', '#000000', '#FFFFFF', 17732], CHA: ['East', 'Southeast', '#1D1160', '#00788C', 19077],
  CHI: ['East', 'Central', '#CE1141', '#000000', 20917], CLE: ['East', 'Central', '#860038', '#FDBB30', 19432],
  DAL: ['West', 'Southwest', '#00538C', '#B8C4CA', 19200], DEN: ['West', 'Northwest', '#0E2240', '#FEC524', 19520],
  DET: ['East', 'Central', '#C8102E', '#1D42BA', 20332], GSW: ['West', 'Pacific', '#1D428A', '#FFC72C', 18064],
  HOU: ['West', 'Southwest', '#CE1141', '#000000', 18055], IND: ['East', 'Central', '#002D62', '#FDBB30', 17274],
  LAC: ['West', 'Pacific', '#C8102E', '#1D428A', 18000], LAL: ['West', 'Pacific', '#552583', '#FDB927', 18997],
  MEM: ['West', 'Southwest', '#5D76A9', '#12173F', 17794], MIA: ['East', 'Southeast', '#98002E', '#F9A01B', 19600],
  MIL: ['East', 'Central', '#00471B', '#EEE1C6', 17341], MIN: ['West', 'Northwest', '#0C2340', '#78BE20', 18978],
  NOP: ['West', 'Southwest', '#0C2340', '#C8102E', 16867], NYK: ['East', 'Atlantic', '#006BB6', '#F58426', 19812],
  OKC: ['West', 'Northwest', '#007AC1', '#EF3B24', 18203], ORL: ['East', 'Southeast', '#0077C0', '#C4CED4', 18846],
  PHI: ['East', 'Atlantic', '#006BB6', '#ED174C', 20478], PHX: ['West', 'Pacific', '#1D1160', '#E56020', 17071],
  POR: ['West', 'Northwest', '#E03A3E', '#000000', 19393], SAC: ['West', 'Pacific', '#5A2D81', '#63727A', 17608],
  SAS: ['West', 'Southwest', '#C4CED4', '#000000', 18418], TOR: ['East', 'Atlantic', '#CE1141', '#000000', 19800],
  UTA: ['West', 'Northwest', '#002B5C', '#F9A01B', 18306], WAS: ['East', 'Southeast', '#002B5C', '#E31837', 20356],
};

// ---------- roster (stats.nba.com playerindex) ----------
const idx = JSON.parse(fs.readFileSync(path.join(RAW, 'playerindex-2026-27.json'), 'utf8')).resultSets[0];
const roster = idx.rowSet.map((r) => Object.fromEntries(idx.headers.map((h, i) => [h, r[i]])))
  .filter((r) => r.TEAM_ID && r.ROSTER_STATUS === 1);

const teams = new Map();
for (const r of roster) {
  if (teams.has(r.TEAM_ABBREVIATION)) continue;
  const [conference, division, primary, secondary, arenaCapacity] = META[r.TEAM_ABBREVIATION];
  teams.set(r.TEAM_ABBREVIATION, {
    id: String(r.TEAM_ID), abbr: r.TEAM_ABBREVIATION, city: r.TEAM_CITY, name: r.TEAM_NAME,
    conference, division, colors: { primary, secondary }, logo: `logos/${r.TEAM_ABBREVIATION}.svg`, arenaCapacity,
  });
}

// ---------- bbref parsing ----------
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');

function bbrefRows(file, nameStat) {
  const html = fs.readFileSync(path.join(RAW, file), 'utf8').replace(/<!--|-->/g, '');
  const rows = [];
  for (const tr of html.split('<tr').slice(1)) {
    if (!tr.includes(`data-stat="${nameStat}"`)) continue;
    const row = { _cls: {} };
    for (const m of tr.matchAll(/<t[dh][^>]*?class="([^"]*)"[^>]*data-stat="([a-z_0-9]+)"[^>]*>(.*?)<\/t[dh]>/g)) {
      row[m[2]] = m[3].replace(/<[^>]+>/g, '').trim();
      row._cls[m[2]] = m[1];
    }
    const id = tr.match(/data-append-csv="([^"]+)"/);
    if (id && row[nameStat]) { row._bid = id[1]; rows.push(row); }
  }
  return rows;
}

const num = (v) => (v === undefined || v === '' ? 0 : Number(v.replace(/[$,%]/g, '')) || 0);
const numN = (v) => (v === undefined || v === '' ? null : Number(v));

const SEASONS = [[2026, '2025-26'], [2025, '2024-25'], [2024, '2023-24']];
const statsByBid = new Map(); // bid -> SeasonStats[] newest first
const bioByBid = new Map();   // bid -> { name, age2026?, pos }

for (const [yr, label] of SEASONS) {
  const adv = new Map();
  for (const r of bbrefRows(`bbref-advanced-${yr}.html`, 'name_display')) if (!adv.has(r._bid)) adv.set(r._bid, r);
  const seen = new Set();
  for (const r of bbrefRows(`bbref-totals-${yr}.html`, 'name_display')) {
    // Traded players: first row is combined (2TM/3TM), later rows per team; take first, team = last listed.
    if (seen.has(r._bid)) { statsByBid.get(r._bid)[0].team = r.team_name_abbr; continue; }
    seen.add(r._bid);
    const a = adv.get(r._bid) ?? {};
    const s = {
      season: label, team: r.team_name_abbr,
      gp: num(r.games), gs: num(r.games_started), min: num(r.mp),
      pts: num(r.pts), orb: num(r.orb), drb: num(r.drb), ast: num(r.ast), stl: num(r.stl), blk: num(r.blk),
      tov: num(r.tov), pf: num(r.pf), fgm: num(r.fg), fga: num(r.fga), tpm: num(r.fg3), tpa: num(r.fg3a),
      ftm: num(r.ft), fta: num(r.fta),
      usg: numN(a.usg_pct), per: numN(a.per), bpm: numN(a.bpm), obpm: numN(a.obpm), dbpm: numN(a.dbpm),
    };
    if (!statsByBid.has(r._bid)) statsByBid.set(r._bid, []);
    statsByBid.get(r._bid).push(s);
    if (!bioByBid.has(r._bid)) bioByBid.set(r._bid, { name: r.name_display, age: num(r.age), ageYear: yr, pos: r.pos });
  }
}

// Contracts: y1 = 2026-27. class salary-pl / salary-tm marks options.
const contractByBid = new Map();
for (const r of bbrefRows('bbref-contracts.html', 'player')) {
  const salaries = [];
  let option;
  for (let i = 1; i <= 6; i++) {
    const amt = num(r[`y${i}`]);
    if (!amt) break;
    const season = `${2025 + i}-${String(26 + i).padStart(2, '0')}`;
    salaries.push({ season, amount: amt });
    const cls = r._cls[`y${i}`] ?? '';
    if (!option && cls.includes('salary-pl')) option = { season, kind: 'player' };
    if (!option && cls.includes('salary-tm')) option = { season, kind: 'team' };
  }
  if (salaries.length && !contractByBid.has(r._bid)) contractByBid.set(r._bid, { salaries, option });
  if (!bioByBid.has(r._bid)) bioByBid.set(r._bid, { name: r.player });
}

const bidByName = new Map();
for (const [bid, b] of bioByBid) {
  const k = norm(b.name);
  if (!bidByName.has(k)) bidByName.set(k, bid);
}

// ---------- merge ----------
const MIN_2627 = 1_272_870; // approx vet min used to tag min deals
function positionsFor(nbaPos, bbPos, heightCm) {
  if (bbPos && /^(PG|SG|SF|PF|C)/.test(bbPos)) {
    const list = bbPos.split('-').filter((p) => ['PG', 'SG', 'SF', 'PF', 'C'].includes(p));
    if (list.length) return list;
  }
  const g = heightCm < 193 ? 'PG' : 'SG';
  const f = heightCm < 203 ? 'SF' : 'PF';
  return ({ G: [g], F: [f], C: ['C'], 'G-F': ['SG', 'SF'], 'F-G': ['SF', 'SG'], 'F-C': ['PF', 'C'], 'C-F': ['C', 'PF'] })[nbaPos] ?? [f];
}

const unmatched = [];
const players = roster.map((r) => {
  const name = `${r.PLAYER_FIRST_NAME} ${r.PLAYER_LAST_NAME}`;
  const bid = bidByName.get(norm(name));
  if (!bid && Number(r.FROM_YEAR) < 2026) unmatched.push(name);
  const bio = bid ? bioByBid.get(bid) : undefined;
  const [ft, inch] = String(r.HEIGHT ?? '6-6').split('-').map(Number);
  const heightCm = Math.round((ft * 12 + (inch || 0)) * 2.54);
  const draftYear = Number(r.DRAFT_YEAR) || null;
  // bbref age = age on Feb 1 of season end year → birth ≈ Aug of (year - age - 1).
  const birthDate = bio?.age ? `${bio.ageYear - bio.age - 1}-08-01`
    : draftYear ? `${draftYear - 20}-03-01` : `${Number(r.FROM_YEAR || 2026) - 21}-06-01`;
  const c = bid ? contractByBid.get(bid) : undefined;
  const twoWay = r.SUPPLEMENTAL_STATUS && /two/i.test(String(r.SUPPLEMENTAL_STATUS));
  const id = String(r.PERSON_ID);
  return {
    id, firstName: r.PLAYER_FIRST_NAME, lastName: r.PLAYER_LAST_NAME, teamId: String(r.TEAM_ID),
    jersey: r.JERSEY_NUMBER ?? '', positions: positionsFor(r.POSITION, bio?.pos, heightCm),
    heightCm, weightKg: Math.round(Number(r.WEIGHT || 220) * 0.4536), birthDate, country: r.COUNTRY ?? '',
    draft: draftYear ? { year: draftYear, round: Number(r.DRAFT_ROUND) || 0, pick: Number(r.DRAFT_NUMBER) || 0 } : null,
    yearsPro: Math.max(0, 2026 - Number(r.FROM_YEAR || 2026)),
    face: fs.existsSync(path.join(ROOT, 'data/faces', `${id}.png`)) ? `faces/${id}.png` : null,
    stats: bid ? statsByBid.get(bid) ?? [] : [],
    contract: c ? {
      salaries: c.salaries, option: c.option,
      type: twoWay ? 'two-way' : draftYear >= 2023 && Number(r.DRAFT_ROUND) === 1 ? 'rookie' : c.salaries[0].amount <= MIN_2627 * 1.6 ? 'min' : 'standard',
    } : twoWay ? { salaries: [{ season: '2026-27', amount: 636_435 }], type: 'two-way' } : null,
  };
});

// ---------- images ----------
async function download(url, file, force) {
  if (!force && fs.existsSync(file)) return true;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return false;
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    return true;
  } catch { return false; }
}
const forceLogos = process.argv.includes('--logos');
let logoFail = 0;
for (const t of teams.values()) {
  if (!(await download(`https://cdn.nba.com/logos/nba/${t.id}/primary/L/logo.svg`, path.join(ROOT, 'data', t.logo), forceLogos))) logoFail++;
}
const missing = players.filter((p) => !p.face);
for (let i = 0; i < missing.length; i += 8) {
  await Promise.all(missing.slice(i, i + 8).map(async (p) => {
    const f = path.join(ROOT, 'data/faces', `${p.id}.png`);
    if (await download(`https://cdn.nba.com/headshots/nba/latest/1040x760/${p.id}.png`, f)) p.face = `faces/${p.id}.png`;
  }));
}

fs.writeFileSync(path.join(OUT, 'teams.json'), JSON.stringify([...teams.values()], null, 1));
fs.writeFileSync(path.join(OUT, 'players.json'), JSON.stringify(players));

const per = {}; players.forEach((p) => (per[p.teamId] = (per[p.teamId] ?? 0) + 1));
const counts = Object.values(per);
console.log({
  teams: teams.size, players: players.length, perTeam: [Math.min(...counts), Math.max(...counts)],
  withStats: players.filter((p) => p.stats.length).length, withContract: players.filter((p) => p.contract).length,
  withFace: players.filter((p) => p.face).length, logoFail, unmatched: unmatched.length, sample: unmatched.slice(0, 12),
});
