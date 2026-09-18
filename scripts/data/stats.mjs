import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rawDir = path.join(__dirname, '../../data/raw');
const outDir = path.join(__dirname, '../../data/nba');
fs.mkdirSync(rawDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch with cache
async function fetchWithCache(url, filename) {
  const filepath = path.join(rawDir, filename);
  if (fs.existsSync(filepath)) {
    return fs.readFileSync(filepath, 'utf-8');
  }

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const html = await res.text();
    fs.writeFileSync(filepath, html);
    return html;
  } catch (e) {
    console.error(`✗ Fetch error for ${url}: ${e.message}`);
    return null;
  }
}

// Fetch season stats from Basketball-Reference
async function fetchStatsSeasons() {
  console.log('Fetching stats from Basketball-Reference...');

  const stats = {}; // Will store stats if parsing succeeds
  const seasons = [2026, 2025, 2024]; // Years for 2025-26, 2024-25, 2023-24

  for (const year of seasons) {
    console.log(`Fetching ${year}...`);

    // Totals
    const totalsUrl = `https://www.basketball-reference.com/leagues/NBA_${year}_totals.html`;
    const totalsHtml = await fetchWithCache(totalsUrl, `bbref-totals-${year}.html`);

    if (totalsHtml) {
      // Just check if we got HTML back
      if (totalsHtml.length > 1000) {
        console.log(`  ✓ Totals cached (${totalsHtml.length} bytes)`);
      } else {
        console.log(`  ⚠ Totals response too small`);
      }
    }

    await sleep(3500);

    // Advanced
    const advUrl = `https://www.basketball-reference.com/leagues/NBA_${year}_advanced.html`;
    const advHtml = await fetchWithCache(advUrl, `bbref-advanced-${year}.html`);

    if (advHtml && advHtml.length > 1000) {
      console.log(`  ✓ Advanced cached (${advHtml.length} bytes)`);
    }

    await sleep(3500);
  }

  // Contracts
  console.log('Fetching contracts...');
  const contractUrl = 'https://www.basketball-reference.com/contracts/players.html';
  const contractHtml = await fetchWithCache(contractUrl, `bbref-contracts.html`);

  if (contractHtml && contractHtml.length > 1000) {
    console.log(`  ✓ Contracts cached (${contractHtml.length} bytes)`);
  }

  // Empty stats output (detailed parsing would require better HTML parsing)
  fs.writeFileSync(path.join(outDir, 'stats.json'), JSON.stringify({}, null, 2));
  console.log('✓ Stats caching complete');
  return stats;
}

await fetchStatsSeasons();
