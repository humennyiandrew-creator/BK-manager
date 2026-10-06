// Screen smoke test: serves the renderer with Vite (no Electron), drives a headless Chromium through
// the title screen, the club picker, every tab, the player page and a live game, and fails on any
// page error or React warning. Usage: npm run smoke  (set SMOKE_SHOTS=dir to keep screenshots).
//
// Needs a Chromium that playwright-core can find: `npx playwright install chromium` once, or set
// CHROMIUM_PATH to an existing Chrome/Chromium binary.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.SMOKE_SHOTS ? resolve(process.env.SMOKE_SHOTS) : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const TABS = [
  'home', 'messages', 'calendar', 'roster', 'training', 'playbook', 'locker', 'squadHub', 'gleague',
  'transfers', 'draft', 'staff', 'facilities', 'finances', 'board', 'standings', 'league', 'moments',
  'career', 'stories', 'settings',
];

const server = await createServer({
  configFile: false,
  root: resolve(ROOT, 'src'),
  resolve: { alias: { '@data': resolve(ROOT, 'data') } },
  server: { port: 0, fs: { allow: [ROOT] } },
  plugins: [react()],
  logLevel: 'error',
});
await server.listen();
const url = server.resolvedUrls.local[0];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
// The renderer talks to Electron through window.bk; give it an in-memory save store, and serve
// bkdata:// images from the repo's data folder.
await ctx.addInitScript((dataRoot) => {
  const fix = (v) => (typeof v === 'string' && v.startsWith('bkdata://') ? `/@fs${dataRoot}/${v.slice(9)}` : v);
  const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', { get() { return desc.get.call(this); }, set(v) { desc.set.call(this, fix(v)); } });
  const setAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (k, v) { return setAttr.call(this, k, k === 'src' || k === 'href' ? fix(v) : v); };
  const mem = {};
  window.bk = {
    saveGame: async (slot, data) => { mem[slot] = JSON.parse(JSON.stringify(data)); },
    loadGame: async (slot) => mem[slot] ?? null,
    listSaves: async () => Object.entries(mem).map(([slot, d]) => ({ slot: +slot, teamName: d.teamName, date: d.date, savedAt: new Date().toISOString(), teamId: d.teamId, logo: d.logo, color: d.color, record: d.record, season: d.season })),
    deleteSave: async (slot) => { delete mem[slot]; },
  };
}, resolve(ROOT, 'data'));

const page = await ctx.newPage();
const problems = [];
let step = 'load';
page.on('pageerror', (e) => problems.push(`[${step}] page error: ${e.message}`));
page.on('console', (m) => {
  const text = m.text();
  // Missing face photos fall back to a silhouette by design.
  if (text.startsWith('Failed to load resource')) return;
  if (m.type() === 'error' || (m.type() === 'warning' && text.startsWith('Warning:'))) problems.push(`[${step}] console ${m.type()}: ${text.slice(0, 300)}`);
});

const shot = async (name) => { if (SHOTS) await page.screenshot({ path: resolve(SHOTS, `${name}.png`) }); };
async function run(name, fn) {
  step = name;
  try { await fn(); } catch (e) { problems.push(`[${name}] ${String(e).split('\n')[0]}`); }
  await shot(name);
}
const js = (fn, arg) => page.evaluate(fn, arg);

await run('title', async () => {
  await page.goto(url);
  await page.getByRole('button', { name: 'New career', exact: true }).first().waitFor({ timeout: 15000 });
});
await run('picker', async () => {
  await page.getByRole('button', { name: 'New career', exact: true }).first().click();
  await page.getByRole('button', { name: 'Select' }).first().click();
  await page.getByRole('button', { name: /Celtics/ }).first().click({ timeout: 20000 });
});
await run('take-the-job', async () => {
  await page.getByRole('button', { name: 'Take the job' }).click();
  await page.waitForFunction(() => window.__bk?.useUI.getState().view === 'shell', null, { timeout: 30000 });
});
// Move a few weeks into the season so the screens have something to show.
await run('advance', async () => {
  await js(async () => {
    const season = await import('/engine/season.ts');
    const events = await import('/engine/events.ts');
    window.__bk.useGame.getState().mutate((s) => {
      for (let i = 0; i < 45; i++) {
        season.advanceDay(s, true);
        for (const e of s.events) if (!e.resolved) events.resolveEvent(s, e.id, e.choices[0].id);
      }
    });
  });
});
for (const tab of TABS) {
  await run(`tab-${tab}`, async () => {
    await js((t) => window.__bk.useUI.getState().setTab(t), tab);
    await page.waitForTimeout(250);
  });
}
await run('player-page', async () => {
  await js(() => { const s = window.__bk.useGame.getState().s; window.__bk.useUI.getState().openPlayer(s.teams[s.userTeamId].rotation[0]); });
  await page.waitForTimeout(300);
  await js(() => window.__bk.useUI.getState().closePlayer());
});
await run('match', async () => {
  await js(async () => {
    const season = await import('/engine/season.ts');
    const events = await import('/engine/events.ts');
    const g = window.__bk.useGame.getState();
    g.mutate((s) => {
      for (let i = 0; i < 10 && !season.userGameToday(s); i++) {
        season.advanceDay(s, true);
        for (const e of s.events) if (!e.resolved) events.resolveEvent(s, e.id, e.choices[0].id);
      }
      if (s.press) s.press.pending = undefined;
    });
    window.__bk.useGame.getState().continue();
  });
  await page.getByRole('button', { name: 'Tip off' }).click({ timeout: 15000 });
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Sim to end' }).click();
  await page.getByRole('button', { name: 'Continue' }).first().click({ timeout: 15000 });
  await page.waitForFunction(() => window.__bk.useUI.getState().view === 'shell', null, { timeout: 15000 });
});

await browser.close();
await server.close();
if (problems.length) {
  console.error(`Smoke test failed with ${problems.length} problem(s):\n${[...new Set(problems)].join('\n')}`);
  process.exit(1);
}
console.log(`Smoke test passed: title, club picker, ${TABS.length} tabs, player page and a live game.`);
