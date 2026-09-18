import { useMemo, useState } from 'react';
import Panel from './Panel';
import BipolarBar from './BipolarBar';
import { useGame, useGameState } from '../store/useGame';
import { teamProfile, offenseFit, defenseFit, suggestTactics, type Profile } from '../../engine/playbook/fit';
import { tacticLab, type LabResult } from '../../engine/playbook/lab';
import { SYSTEMS, SCHEMES } from '../../engine/playbook/systems';
import type { Tactics } from '../../engine/model';
import type { OffSystem, DefScheme } from '../../engine/playbook/types';
import styles from './TacticFitPanel.module.css';

const LEAGUE_MEAN: Record<string, number> = {
  spacing: 64.4, rim: 68.1, post: 79.4, handling: 70.5, glass: 67.8, size: 202.8, speed: 56.4, rimProt: 85.3, perimD: 64.1
};
const PROFILE_ROWS: { key: keyof Profile; label: string }[] = [
  { key: 'spacing', label: 'Spacing' }, { key: 'rim', label: 'Rim' }, { key: 'post', label: 'Post' },
  { key: 'handling', label: 'Handling' }, { key: 'glass', label: 'Glass' }, { key: 'size', label: 'Size' },
  { key: 'speed', label: 'Speed' }, { key: 'rimProt', label: 'Rim Protection' }, { key: 'perimD', label: 'Perimeter D' }
];
const WARN_WORDS = ['poor', 'without', 'weak', 'wastes', 'sloppy', 'slow'];
const isWarn = (n: string) => WARN_WORDS.some((w) => n.toLowerCase().includes(w));

export default function TacticFitPanel() {
  const s = useGameState();
  const mutate = useGame((g) => g.mutate);
  const [draft, setDraft] = useState<Tactics | null>(null);
  const [lab, setLab] = useState<LabResult | null>(null);
  const [labBusy, setLabBusy] = useState(false);

  const team = s?.teams[s.userTeamId];

  const profile = useMemo(() => {
    if (!s || !team) return null;
    const roster = Object.values(s.players).filter((p) => p.teamId === team.id);
    return teamProfile(roster, team.minutes);
  }, [s, team]);

  if (!s || !team || !profile) return null;
  const current = team.tactics;
  const active = draft ?? current;
  const dirty = draft != null;

  const off = offenseFit(profile, active);
  const def = defenseFit(profile, active.defense);
  const notes = [...off.notes, ...def.notes];

  function edit(fn: (t: Tactics) => void) {
    setLab(null);
    setDraft((d) => {
      const base = d ?? current;
      const next: Tactics = { ...base, playWeights: { ...base.playWeights } };
      fn(next);
      return next;
    });
  }

  function handleSuggest() {
    const sug = suggestTactics(profile!, active);
    edit((t) => Object.assign(t, sug));
  }
  function handleLab() {
    setLabBusy(true);
    setTimeout(() => {
      const res = tacticLab(s!, s!.userTeamId, active, 120);
      setLab(res);
      setLabBusy(false);
    }, 20);
  }
  function handleApply() {
    mutate((st) => { st.teams[st.userTeamId].tactics = active; });
    setDraft(null);
    setLab(null);
  }
  function handleReset() {
    setDraft(null);
    setLab(null);
  }

  const labColor = !lab ? undefined : lab.delta - lab.margin > 0 ? 'var(--positive)' : lab.delta + lab.margin < 0 ? 'var(--negative)' : 'var(--text-muted)';

  return (
    <Panel title="Tactic Fit" className={styles.panel}>
      <div className={styles.wrap}>
        <div className={styles.bars}>
          <BipolarBar label="Offense Fit" value={off.score} />
          <BipolarBar label="Defense Fit" value={def.score} />
        </div>

        {notes.length > 0 && (
          <div className={styles.notes}>
            {notes.map((n, i) => (
              <div key={i} className={isWarn(n) ? `${styles.note} ${styles.noteWarn}` : `${styles.note} ${styles.noteGood}`}>{n}</div>
            ))}
          </div>
        )}

        <div className={styles.sectionLabel}>Roster Profile vs League</div>
        <div className={styles.profileList}>
          {PROFILE_ROWS.map(({ key, label }) => {
            const val = profile[key];
            const mean = LEAGUE_MEAN[key];
            const pct = Math.round((val / mean) * 100);
            const arrow = pct >= 102 ? '▲' : pct <= 98 ? '▼' : '—';
            const arrowColor = pct >= 102 ? 'var(--positive)' : pct <= 98 ? 'var(--negative)' : 'var(--text-muted)';
            return (
              <div key={key} className={styles.profileRow}>
                <span className={styles.profileLabel}>{label}</span>
                <span className={styles.profileVal}>{key === 'size' ? `${val.toFixed(0)}cm` : val.toFixed(1)}</span>
                <span className={styles.profilePct} style={{ color: arrowColor }}>{arrow} {pct}%</span>
              </div>
            );
          })}
        </div>

        <div className={styles.sectionLabel}>Draft Tactics {dirty && <span className={styles.dirtyTag}>unsaved</span>}</div>
        <div className={styles.draftFields}>
          <div className={styles.draftField}>
            <label>Offense</label>
            <select value={active.offense} onChange={(e) => edit((t) => (t.offense = e.target.value as OffSystem))}>
              {Object.values(SYSTEMS).map((sys) => <option key={sys.id} value={sys.id}>{sys.name}</option>)}
            </select>
          </div>
          <div className={styles.draftField}>
            <label>Defense</label>
            <select value={active.defense} onChange={(e) => edit((t) => (t.defense = e.target.value as DefScheme))}>
              {Object.values(SCHEMES).map((sc) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
            </select>
          </div>
          {(['threeFocus', 'crashGlass', 'pace'] as const).map((k) => (
            <div key={k} className={styles.draftSlider}>
              <label>{k === 'threeFocus' ? 'Shot Profile' : k === 'crashGlass' ? 'Crash Glass' : 'Pace'}</label>
              <input type="range" min={0} max={100} value={active[k]} onChange={(e) => edit((t) => (t[k] = Number(e.target.value)))} />
              <span>{active[k]}</span>
            </div>
          ))}
        </div>

        <div className={styles.btnRow}>
          <button className={styles.btn} onClick={handleSuggest}>Suggest</button>
          <button className={styles.btn} onClick={handleLab} disabled={labBusy}>{labBusy ? 'Simulating…' : 'Tactic Lab'}</button>
          <button className={styles.btnPrimary} onClick={handleApply} disabled={!dirty}>Apply</button>
          <button className={styles.btn} onClick={handleReset} disabled={!dirty}>Reset</button>
        </div>

        {lab && (
          <div className={styles.labResult} style={{ color: labColor }}>
            {lab.delta > 0 ? '+' : ''}{lab.delta} ± {lab.margin} pts/game vs your current tactics
          </div>
        )}
      </div>
    </Panel>
  );
}
