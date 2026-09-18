import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../../data');
const facesDir = path.join(dataDir, 'faces');
const logosDir = path.join(dataDir, 'logos');
const nbaDir = path.join(dataDir, 'nba');

fs.mkdirSync(facesDir, { recursive: true });
fs.mkdirSync(logosDir, { recursive: true });

// Fetch with timeout and retry
async function fetchFile(url, filepath, retries = 2) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      clearTimeout(timeout);

      if (!res.ok) {
        console.warn(`  ✗ ${path.basename(filepath)} (${res.status})`);
        return false;
      }

      const buffer = await res.arrayBuffer();
      fs.writeFileSync(filepath, Buffer.from(buffer));
      return true;
    } catch (e) {
      if (i === retries - 1) {
        console.warn(`  ✗ ${path.basename(filepath)} (${e.message})`);
        return false;
      }
    }
  }
  return false;
}

// Concurrent download queue
async function downloadQueue(items, concurrency = 8) {
  let completed = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const promises = batch.map(async (item) => {
      const success = await fetchFile(item.url, item.path);
      if (success) completed++;
      else failed++;
    });

    await Promise.all(promises);
    console.log(`  ${completed + failed}/${items.length} downloaded`);
  }

  return { completed, failed };
}

// Download player headshots
async function downloadHeadshots() {
  console.log('Downloading player headshots...');

  const players = JSON.parse(fs.readFileSync(path.join(nbaDir, 'players.json'), 'utf-8'));
  const items = [];

  for (const p of players) {
    const filepath = path.join(facesDir, `${p.id}.png`);
    if (!fs.existsSync(filepath)) {
      const url = `https://cdn.nba.com/headshots/nba/latest/1040x760/${p.id}.png`;
      items.push({ url, path: filepath });
    }
  }

  if (items.length === 0) {
    console.log('  All headshots already cached');
    return { completed: 0, failed: 0 };
  }

  console.log(`  Downloading ${items.length} headshots...`);
  return await downloadQueue(items, 8);
}

// Download team logos
async function downloadLogos() {
  console.log('Downloading team logos...');

  const teams = JSON.parse(fs.readFileSync(path.join(nbaDir, 'teams.json'), 'utf-8'));
  const items = [];

  for (const t of teams) {
    const filepath = path.join(logosDir, `${t.abbr}.svg`);
    if (!fs.existsSync(filepath)) {
      const url = `https://cdn.nba.com/logos/nba/${t.id}/primary/L/logo.svg`;
      items.push({ url, path: filepath });
    }
  }

  if (items.length === 0) {
    console.log('  All logos already cached');
    return { completed: 0, failed: 0 };
  }

  console.log(`  Downloading ${items.length} logos...`);
  return await downloadQueue(items, 8);
}

// Main
async function run() {
  const headshotResult = await downloadHeadshots();
  console.log(`✓ Headshots: ${headshotResult.completed} ok, ${headshotResult.failed} failed`);

  const logoResult = await downloadLogos();
  console.log(`✓ Logos: ${logoResult.completed} ok, ${logoResult.failed} failed`);

  console.log('Running build to update face fields...');
  const { spawn } = await import('child_process');
  spawn('node', [path.join(__dirname, 'build.mjs')], { stdio: 'inherit' });
}

await run();
