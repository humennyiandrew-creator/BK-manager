import { useState } from 'react';
import Panel from './Panel';
import ProgressBar from './ProgressBar';
import type { GameState } from '../../engine/model';
import { availablePrograms, startProgram, type ProgramOption } from '../../engine/programs';
import { teamRoster } from '../selectors';
import { ATTR_LABEL } from '../attrGroups';
import { toast } from './Toasts';
import styles from './ProgramsPanel.module.css';

interface Props { s: GameState; mutate: (fn: (s: GameState) => void) => void }

const POS_SET = new Set(['PG', 'SG', 'SF', 'PF', 'C']);
function displayLabel(label: string, target: string): string {
  if (POS_SET.has(target)) return label;
  const attrLabel = ATTR_LABEL[target as keyof typeof ATTR_LABEL];
  return attrLabel ? label.replace(/: \w+$/, `: ${attrLabel}`) : label;
}

export default function ProgramsPanel({ s, mutate }: Props) {
  const teamId = s.userTeamId;
  const [pickerId, setPickerId] = useState<string | null>(null);
  const roster = teamRoster(s, teamId);
  const active = roster.filter((p) => p.program);
  const eligible = roster.filter((p) => !p.program).sort((a, b) => b.ratings.pot - a.ratings.pot);
  const atCap = active.length >= 3;

  return (
    <Panel title="Development Programmes" className={styles.panel}>
      {active.length === 0 && <div className={styles.empty}>No active programmes.</div>}
      {active.map((p) => {
        const prog = p.program!;
        return (
          <div key={p.id} className={styles.row}>
            <div className={styles.rowHead}>
              <span className={styles.name}>{p.firstName} {p.lastName}</span>
              <span className={styles.label}>{displayLabel(prog.label, String(prog.target))}</span>
            </div>
            <ProgressBar value={prog.progress} variant="cyan" />
            <div className={styles.meta}>
              <span>{prog.weeksLeft} wk left</span>
              <span>Risk {Math.round(prog.risk * 100)}%</span>
            </div>
          </div>
        );
      })}
      <button type="button" className={styles.startBtn} disabled={atCap} onClick={() => setPickerId(eligible[0]?.id ?? null)}>
        {atCap ? 'Max 3 active programmes' : 'Start Programme'}
      </button>

      {pickerId !== null && (
        <StartProgramModal
          s={s}
          eligible={eligible}
          initialPlayerId={pickerId}
          onClose={() => setPickerId(null)}
          onStart={(playerId, option) => {
            mutate((st) => {
              const err = startProgram(st, playerId, option);
              if (err) toast(err, 'error'); else toast('Programme started', 'success');
            });
            setPickerId(null);
          }}
        />
      )}
    </Panel>
  );
}

function StartProgramModal({ s, eligible, initialPlayerId, onClose, onStart }: {
  s: GameState; eligible: GameState['players'][string][]; initialPlayerId: string;
  onClose: () => void; onStart: (playerId: string, option: ProgramOption) => void;
}) {
  const [playerId, setPlayerId] = useState(initialPlayerId);
  const options = availablePrograms(s, playerId);
  const [optIdx, setOptIdx] = useState(0);
  const option = options[optIdx];

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalTitle}>Start a Development Programme</div>
        <label className={styles.modalLabel}>Player</label>
        <select className={styles.select} value={playerId} onChange={(e) => { setPlayerId(e.target.value); setOptIdx(0); }}>
          {eligible.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName} (OVR {p.ratings.ovr})</option>)}
        </select>
        <label className={styles.modalLabel}>Programme</label>
        <div className={styles.optList}>
          {options.map((o, i) => (
            <button key={i} type="button" className={i === optIdx ? `${styles.optCard} ${styles.optCardActive}` : styles.optCard} onClick={() => setOptIdx(i)}>
              <span className={styles.optLabel}>{displayLabel(o.label, String(o.target))}</span>
              <span className={styles.optMeta}>{o.weeks}wk · +{o.expectedGain} · {Math.round(o.risk * 100)}% risk</span>
            </button>
          ))}
        </div>
        <div className={styles.btns}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button type="button" className={styles.confirmBtn} disabled={!option} onClick={() => option && onStart(playerId, option)}>Confirm</button>
        </div>
      </div>
    </div>
  );
}
