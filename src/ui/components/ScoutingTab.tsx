import { useState } from 'react';
import Panel from './Panel';
import ProgressBar from './ProgressBar';
import type { GameState, ScoutTargetKind } from '../../engine/model';
import { SCOUT_REGIONS, availableColleges, cancelAssignment, removeFromShortlist, startAssignment, matchingProspects } from '../../engine/scouting';
import { scoutView } from '../../engine/draft';
import { staffRating } from '../../engine/mgmt/staff';
import { formatMoneyShort } from '../format';
import { toast } from './Toasts';
import styles from './ScoutingTab.module.css';

interface Props { s: GameState; mutate: (fn: (s: GameState) => void) => void }

const KIND_LABEL: Record<ScoutTargetKind, string> = { region: 'Region', college: 'College/Club', player: 'Prospect', opponent: 'Opponent Team' };

export default function ScoutingTab({ s, mutate }: Props) {
  const teamId = s.userTeamId;
  const [kind, setKind] = useState<ScoutTargetKind>('region');
  const [key, setKey] = useState<string>(SCOUT_REGIONS[0]);
  const [weeks, setWeeks] = useState(4);

  const scoutRating = staffRating(s, teamId, 'scout');
  const analyticsRating = staffRating(s, teamId, 'analytics');
  const scoutCount = s.staff.filter((x) => x.teamId === teamId && x.role === 'scout').length;
  const assignments = s.scouting.assignments;
  const colleges = availableColleges(s);
  const opponents = Object.values(s.teams).filter((t) => t.id !== teamId);
  const prospects = [...s.draftClass].sort((a, b) => (s.players[a].ratings.pot - s.players[b].ratings.pot)).reverse();

  const keyOptions = kind === 'region' ? SCOUT_REGIONS : kind === 'college' ? colleges : kind === 'opponent' ? opponents.map((t) => t.id) : prospects;
  const keyLabel = (k: string) => {
    if (kind === 'opponent') { const t = s.teams[k]; return t ? `${t.city} ${t.name}` : k; }
    if (kind === 'player') { const p = s.players[k]; return p ? `${p.firstName} ${p.lastName}` : k; }
    return k;
  };
  const previewCount = kind === 'region' || kind === 'college' ? matchingProspects(s, kind, key).length : null;

  const start = () => {
    const k = keyOptions.includes(key) ? key : keyOptions[0];
    if (!k) return;
    mutate((st) => {
      const err = startAssignment(st, kind, k, weeks);
      if (err) toast(err, 'error');
    });
  };

  const shortlist = s.scouting.shortlist.map((id) => s.players[id]).filter(Boolean);

  return (
    <div className={styles.wrap}>
      <div className={styles.col}>
        <Panel title="Scouting Department" className={styles.statsPanel}>
          <div className={styles.statRow}><span>Chief Scout rating</span><span>{scoutRating}</span></div>
          <div className={styles.statRow}><span>Analytics rating</span><span>{analyticsRating}</span></div>
          <div className={styles.statRow}><span>Assignments in flight</span><span>{assignments.length} / {scoutCount || 0}</span></div>
        </Panel>

        <Panel title="New Assignment" className={styles.newPanel}>
          <div className={styles.field}>
            <label>Target type</label>
            <select className={styles.select} value={kind} onChange={(e) => { const nk = e.target.value as ScoutTargetKind; setKind(nk); setKey(nk === 'region' ? SCOUT_REGIONS[0] : ''); }}>
              {(['region', 'college', 'player', 'opponent'] as ScoutTargetKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label>{KIND_LABEL[kind]}</label>
            <select className={styles.select} value={key} onChange={(e) => setKey(e.target.value)}>
              {keyOptions.length === 0 && <option value="">None available</option>}
              {keyOptions.map((k) => <option key={k} value={k}>{keyLabel(k)}</option>)}
            </select>
          </div>
          {previewCount != null && <p className={styles.hint}>{previewCount} prospect{previewCount === 1 ? '' : 's'} match this target.</p>}
          <div className={styles.field}>
            <label>Duration: {weeks} weeks</label>
            <input type="range" min={2} max={8} step={1} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className={styles.slider} />
          </div>
          <button type="button" className={styles.startBtn} disabled={!keyOptions.length} onClick={start}>Assign Scout</button>
        </Panel>
      </div>

      <Panel title="Active Assignments" className={styles.activePanel}>
        {assignments.length === 0 && <div className={styles.empty}>No scouts currently assigned.</div>}
        {assignments.map((a) => {
          const pct = ((a.weeksTotal - a.weeksLeft) / a.weeksTotal) * 100;
          return (
            <div key={a.id} className={styles.assignRow}>
              <div className={styles.assignHead}>
                <span className={styles.assignLabel}>{KIND_LABEL[a.kind]}: {a.label}</span>
                <button type="button" className={styles.cancelBtn} onClick={() => mutate((st) => cancelAssignment(st, a.id))}>Cancel</button>
              </div>
              <ProgressBar value={pct} variant="cyan" />
              <div className={styles.assignMeta}><span>{a.weeksLeft} week{a.weeksLeft === 1 ? '' : 's'} left</span><span>{formatMoneyShort(a.cost)}/wk</span></div>
            </div>
          );
        })}
      </Panel>

      <Panel title="Shortlist" className={styles.shortlistPanel}>
        {shortlist.length === 0 && <div className={styles.empty}>Star prospects on the Big Board to track them here.</div>}
        {shortlist.map((p) => {
          const v = scoutView(s, p.id, teamId);
          return (
            <div key={p.id} className={styles.shortRow}>
              <span className={styles.shortName}>{p.firstName} {p.lastName}</span>
              <span className={styles.shortMeta}>{p.positions[0]} · POT {v.pot}±{v.range}</span>
              <button type="button" className={styles.removeBtn} onClick={() => mutate((st) => removeFromShortlist(st, p.id))}>Remove</button>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}
