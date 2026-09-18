// Dev-only visual check: BK_SHOT_SCRIPT=<json> runs [{ js?, wait?, shot? }] steps against the renderer,
// saving PNGs next to the script, then quits. Lets an agent verify screens without driving the GUI.
import { app, type BrowserWindow } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

interface Step { js?: string; wait?: number; shot?: string }

export function runDevShots(win: BrowserWindow) {
  const script = process.env.BK_SHOT_SCRIPT;
  if (!script) return;
  const steps: Step[] = JSON.parse(readFileSync(script, 'utf8').replace(/^﻿/, ''));
  const dir = dirname(script);
  win.webContents.once('did-finish-load', async () => {
    const log: string[] = [];
    for (const st of steps) {
      try {
        if (st.js) log.push(String(await win.webContents.executeJavaScript(st.js, true)));
        if (st.wait) await new Promise((r) => setTimeout(r, st.wait));
        if (st.shot) writeFileSync(join(dir, st.shot), (await win.webContents.capturePage()).toPNG());
      } catch (e) { log.push(`ERR ${String(e)}`); }
    }
    writeFileSync(join(dir, 'shot-log.txt'), log.join('\n'));
    app.quit();
  });
}
