import { useEffect, useState } from 'react';
import HeroHeader from '../components/HeroHeader';
import SideRail, { type SideRailItem } from '../components/SideRail';
import Panel from '../components/Panel';
import StatRow from '../components/StatRow';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import { IconBoard, IconMessages } from '../components/tabIcons';
import { useGameState, useGame } from '../store/useGame';
import { useBoardNav, type BoardSubTab } from '../store/useBoardNav';
import {
  objectiveLabel, boardMeetingAvailable, budgetSuccessChance, requestBudget, makePromise, renegotiateObjective,
  type BudgetKind
} from '../../engine/mgmt/board';
import { answerPress } from '../../engine/media';
import type { Board, BoardPromise } from '../../engine/model';
import { formatDate } from '../format';
import styles from './BoardScreen.module.css';

type HistoryRow = Board['history'][number];

function ConfidenceGauge({ value }: { value: number }) {
  const r = 62, cx = 90, cy = 82;
  const angle = (v: number) => Math.PI * (1 - v / 100);
  const point = (v: number): [number, number] => [cx + r * Math.cos(angle(v)), cy - r * Math.sin(angle(v))];
  const [x0, y0] = point(0);
  const [x100, y100] = point(100);
  const [x1, y1] = point(value);
  const color = value >= 65 ? 'var(--positive)' : value >= 35 ? 'var(--cyan)' : 'var(--negative)';
  return (
    <svg viewBox="0 0 180 118" className={styles.gauge}>
      <path d={`M ${x0} ${y0} A ${r} ${r} 0 1 1 ${x100} ${y100}`} stroke="var(--panel-border)" strokeWidth={14} fill="none" strokeLinecap="round" />
      <path d={`M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`} stroke={color} strokeWidth={14} fill="none" strokeLinecap="round" />
      <text x={cx} y={cy - 8} textAnchor="middle" className={styles.gaugeValue}>{Math.round(value)}</text>
      <text x={cx} y={cy + 16} textAnchor="middle" className={styles.gaugeLabel}>CONFIDENCE</text>
    </svg>
  );
}

const BUDGET_KINDS: { id: BudgetKind; label: string; hint: string }[] = [
  { id: 'staff', label: 'Staff Budget', hint: 'Raises the coaching & scouting staff budget cap.' },
  { id: 'facilities', label: 'Facilities Fund', hint: 'One-off cash injection for facility upgrades.' },
  { id: 'payroll', label: 'Payroll Relief', hint: 'One-off cash injection for the payroll/tax bill.' },
];

const PROMISE_KINDS: { id: BoardPromise['kind']; label: string }[] = [
  { id: 'playoffs', label: 'Reach the Playoffs' },
  { id: 'wins', label: 'Hit a Win Total' },
  { id: 'develop', label: 'Develop a Young Player' },
  { id: 'payroll', label: 'Cut Payroll' },
  { id: 'title', label: 'Win the Title' },
];

const STATUS_LABEL: Record<BoardPromise['status'], string> = { open: 'Open', kept: 'Kept', broken: 'Broken' };
const TONE_LABEL: Record<string, string> = { calm: 'Calm', bold: 'Bold', blunt: 'Blunt', deflect: 'Deflect' };

export default function BoardScreen() {
  const s = useGameState();
  const mutate = useGame((g) => g.mutate);
  const [tab, setTab] = useState<BoardSubTab>('overview');
  const jump = useBoardNav((st) => st.jumpTo);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (jump) { setTab(jump); useBoardNav.getState().clear(); }
  }, [jump]);

  if (!s) return null;
  const b = s.board;

  const historyColumns: DataTableColumn<HistoryRow>[] = [
    { key: 'season', header: 'Season', render: (h) => h.season, sortValue: (h) => h.season },
    { key: 'objective', header: 'Objective', render: (h) => objectiveLabel(h.objective) },
    { key: 'result', header: 'Result', render: (h) => h.result },
    { key: 'met', header: 'Met', align: 'right', render: (h) => (h.met ? <span className={styles.met}>Yes</span> : <span className={styles.notMet}>No</span>) },
  ];

  const promiseColumns: DataTableColumn<BoardPromise>[] = [
    { key: 'date', header: 'Made', render: (p) => formatDate(p.date), sortValue: (p) => p.date },
    { key: 'label', header: 'Promise', render: (p) => p.label },
    { key: 'deadline', header: 'Deadline', render: (p) => formatDate(p.deadline), sortValue: (p) => p.deadline },
    {
      key: 'status', header: 'Status', align: 'right',
      render: (p) => <span className={p.status === 'kept' ? styles.met : p.status === 'broken' ? styles.notMet : undefined}>{STATUS_LABEL[p.status]}</span>,
    },
  ];

  const doBudget = (kind: BudgetKind) => mutate((st) => { setNote(requestBudget(st, kind)); });
  const doPromise = (kind: BoardPromise['kind']) => mutate((st) => { makePromise(st, kind); setNote('Promise made.'); });
  const doRenegotiate = (dir: 'lower' | 'raise') => mutate((st) => { setNote(renegotiateObjective(st, dir)); });
  const doAnswer = (qid: string, cid: string) => mutate((st) => { setNote(answerPress(st, qid, cid)); });

  const available = boardMeetingAvailable(s);
  const pending = s.press?.pending;
  const pressHistory = s.messages.filter((m) => m.kind === 'other' && m.subject.startsWith('Press conference recap')).slice(0, 10);

  const railItems: SideRailItem<BoardSubTab>[] = [
    { id: 'overview', label: 'Overview', icon: IconBoard },
    { id: 'meeting', label: 'Meeting', icon: IconBoard },
    { id: 'promises', label: 'Promises', icon: IconBoard },
    { id: 'media', label: 'Media', icon: IconMessages, badge: pending ? 1 : undefined }
  ];

  return (
    <div className={styles.screen}>
      <HeroHeader title="Board" subtitle="Ownership expectations" />
      <div className={styles.body}>
      <SideRail items={railItems} active={tab} onSelect={(t) => { setTab(t); setNote(null); }} />
      <div className={styles.content}>

      {tab === 'overview' && (
        <div className={styles.tabBody}>
          <div className={styles.col}>
            <Panel title="Board of Directors" className={styles.panel}>
              <div className={styles.gaugeWrap}><ConfidenceGauge value={b.confidence} /></div>
              <StatRow label="Season Objective" value={objectiveLabel(b.objective)} />
              <StatRow label="Budget Multiplier" value={`${b.budgetMul.toFixed(2)}x`} variant={b.budgetMul >= 1 ? 'positive' : b.budgetMul < 0.9 ? 'negative' : 'neutral'} />
            </Panel>
            <Panel title="Long-Term Vision" className={styles.panel}>
              <p className={styles.longTerm}>{b.longTerm}</p>
            </Panel>
          </div>
          <Panel title="Season History" className={styles.historyPanel} flush>
            {b.history.length === 0 ? (
              <div className={styles.empty}>No completed seasons yet.</div>
            ) : (
              <DataTable columns={historyColumns} rows={[...b.history].reverse()} rowKey={(h) => h.season} compact />
            )}
          </Panel>
        </div>
      )}

      {tab === 'meeting' && (
        <div className={styles.tabBody}>
          <div className={styles.col}>
            <Panel title="Request Budget" className={styles.panel} headerRight={<span className={available ? styles.availYes : styles.availNo}>{available ? 'Meeting available' : 'Not available yet'}</span>}>
              {BUDGET_KINDS.map((k) => (
                <div key={k.id} className={styles.actionRow}>
                  <div className={styles.actionInfo}>
                    <span className={styles.actionLabel}>{k.label}</span>
                    <span className={styles.actionHint}>{k.hint}</span>
                  </div>
                  <span className={styles.chance}>{Math.round(budgetSuccessChance(s, k.id) * 100)}%</span>
                  <button type="button" className={styles.actionBtn} disabled={!available} onClick={() => doBudget(k.id)}>Ask</button>
                </div>
              ))}
            </Panel>
            <Panel title="Renegotiate Objective" className={styles.panel}>
              <p className={styles.longTerm}>Current objective: {objectiveLabel(b.objective)}. Once per season.</p>
              <div className={styles.renegRow}>
                <button type="button" className={styles.actionBtn} disabled={b.lastRenegotiateSeason === s.season} onClick={() => doRenegotiate('lower')}>Lower (−confidence)</button>
                <button type="button" className={styles.actionBtn} disabled={b.lastRenegotiateSeason === s.season} onClick={() => doRenegotiate('raise')}>Raise (+confidence)</button>
              </div>
            </Panel>
          </div>
          <Panel title="Make a Promise" className={styles.panel}>
            {PROMISE_KINDS.map((k) => (
              <div key={k.id} className={styles.actionRow}>
                <span className={styles.actionLabel}>{k.label}</span>
                <button type="button" className={styles.actionBtn} onClick={() => doPromise(k.id)}>Promise</button>
              </div>
            ))}
            {note && <div className={styles.note}>{note}</div>}
          </Panel>
        </div>
      )}

      {tab === 'promises' && (
        <Panel title="Board Promises" className={styles.panel} flush>
          {s.promises.length === 0 ? (
            <div className={styles.empty}>No promises made yet.</div>
          ) : (
            <DataTable columns={promiseColumns} rows={s.promises} rowKey={(p) => String(p.id)} compact />
          )}
        </Panel>
      )}

      {tab === 'media' && (
        <div className={styles.tabBody}>
          <Panel title="Press Conference" className={styles.panel}>
            {!pending && <div className={styles.empty}>No press conference right now.</div>}
            {pending && pending.questions.map((q) => {
              const answered = pending.answered.includes(q.id);
              return (
                <div key={q.id} className={styles.pressQ}>
                  <div className={styles.pressText}>{q.text}</div>
                  <div className={styles.pressChoices}>
                    {q.choices.map((c) => (
                      <button key={c.id} type="button" className={styles.pressChoice} disabled={answered} onClick={() => doAnswer(q.id, c.id)}>
                        <span className={styles.toneTag}>{TONE_LABEL[c.tone]}</span>
                        {c.label}
                      </button>
                    ))}
                  </div>
                  {answered && <div className={styles.answered}>Answered</div>}
                </div>
              );
            })}
            {note && <div className={styles.note}>{note}</div>}
          </Panel>
          <Panel title="Press History" className={styles.panel} flush>
            {pressHistory.length === 0 ? (
              <div className={styles.empty}>No past press conferences.</div>
            ) : (
              <div className={styles.historyList}>
                {pressHistory.map((m) => (
                  <div key={m.id} className={styles.historyItem}>
                    <span className={styles.historyDate}>{formatDate(m.date)}</span>
                    <span>{m.body}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}
      </div>
      </div>
    </div>
  );
}
