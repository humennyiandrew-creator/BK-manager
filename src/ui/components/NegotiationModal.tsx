import { useEffect, useMemo, useRef, useState } from 'react';
import BkImage from './BkImage';
import { useGame } from '../store/useGame';
import type { ContractOffer, GameState } from '../../engine/model';
import { type NegKind, startNegotiation, makeOffer } from '../../engine/negotiation';
import { ageOf } from '../../engine/ratings';
import { capYear, isTwoWay, marketValue, maxSalary, minSalary, salaryIn, signingCheck, yearsLeft } from '../../engine/cba';
import { formatMoney, formatMoneyShort } from '../format';
import { play } from '../sound';
import { toast } from './Toasts';
import styles from './NegotiationModal.module.css';

type Mutate = (fn: (s: GameState) => void) => void;

const KIND_LABEL: Record<NegKind, string> = { fa: 'Free agency', resign: 'Re-sign', extension: 'Extension' };

export default function NegotiationModal({ s, mutate, playerId, kind, onClose }: { s: GameState; mutate: Mutate; playerId: string; kind: NegKind; onClose: () => void }) {
  const p = s.players[playerId];

  useEffect(() => {
    mutate((st) => { startNegotiation(st, playerId, kind); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, kind]);

  const neg = useMemo(
    () => s.negotiations.find((n) => n.playerId === playerId && n.kind === kind),
    [s.negotiations, playerId, kind]
  );

  const salYear = kind === 'extension' ? s.seasonYear + 1 : capYear(s);
  const min = minSalary(salYear, p.yearsPro);
  const max = Math.max(maxSalary(salYear, p.yearsPro), neg?.ask.amount ?? min);
  const [amount, setAmount] = useState(neg?.ask.amount ?? min);
  const [years, setYears] = useState(neg?.ask.years ?? 2);
  const [playerOption, setPlayerOption] = useState(false);
  const [teamOption, setTeamOption] = useState(false);
  const [incentives, setIncentives] = useState(0);

  // Seed the builder once the negotiation exists.
  useEffect(() => {
    if (neg && neg.round === 0) { setAmount(neg.ask.amount); setYears(neg.ask.years); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neg?.id]);

  const prevLogLen = useRef(0);
  useEffect(() => {
    if (!neg) return;
    if (neg.log.length > prevLogLen.current) {
      const added = neg.log.slice(prevLogLen.current);
      if (added.some((e) => e.by === 'agent')) play('notify');
    }
    prevLogLen.current = neg.log.length;
  }, [neg?.log.length]);

  const prevStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!neg) return;
    if (prevStatus.current === 'open' && neg.status === 'signed') toast('Deal signed.', 'success');
    else if (prevStatus.current === 'open' && neg.status === 'walked') toast('Agent walked away from the table.', 'error');
    prevStatus.current = neg.status;
  }, [neg?.status]);

  if (!p || !neg) return null;

  const mv = marketValue(p, s.seasonYear);
  const open = neg.status === 'open';
  const submit = () => {
    const offer: ContractOffer = { amount, years, playerOption: playerOption || undefined, teamOption: teamOption || undefined, incentives: incentives || undefined };
    mutate((st) => { makeOffer(st, neg.id, offer); });
  };

  const effAmount = amount + Math.round(incentives * 0.5);
  const capCheck = kind === 'fa' ? signingCheck(s, s.userTeamId, p, effAmount, false) : null;
  const capLine = kind === 'fa'
    ? (capCheck!.reason ?? (capCheck!.usesMle ? 'Uses Mid-Level Exception' : 'Cap legal'))
    : kind === 'resign' ? 'Bird rights — can exceed the cap to keep him'
      : `Starts ${s.seasonYear + 1}-${String((s.seasonYear + 2) % 100).padStart(2, '0')} — no cap impact this season`;
  const capBad = kind === 'fa' && !!capCheck!.reason;

  return (
    <div className={`${styles.backdrop} fade-in`} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalPop}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.kicker}>{KIND_LABEL[kind]} Negotiation</span>
          <button type="button" className={styles.closeBtn} onClick={onClose}>×</button>
        </div>
        <div className={styles.grid}>
          <div className={styles.left}>
            <BkImage path={p.face} alt={p.lastName} className={styles.face} />
            <div className={styles.name}>{p.firstName} {p.lastName}</div>
            <div className={styles.meta}>{p.positions.join('/')}, Age {Math.floor(ageOf(p.birthDate))}, OVR {p.ratings.ovr}, POT {Math.round(p.ratings.pot)}</div>
            <div className={styles.metaRow}><span>Form</span><span>{(p.form ?? 0) > 0 ? '+' : ''}{(p.form ?? 0).toFixed(1)}</span></div>
            <div className={styles.metaRow}><span>Morale</span><span>{p.morale}</span></div>
            <div className={styles.metaRow}><span>Market value</span><span>{formatMoneyShort(mv)}</span></div>
            <div className={styles.metaRow}>
              <span>Current deal</span>
              <span>{p.contract && !isTwoWay(p) ? `${formatMoneyShort(salaryIn(p, s.season))}, ${yearsLeft(p, s.season)}y` : '–'}</span>
            </div>
            <div className={styles.divider} />
            <div className={styles.patienceLabel}>Agent patience</div>
            <div className={styles.meterTrack}>
              <div className={styles.meterFill} style={{ width: `${Math.max(0, neg.patience)}%`, background: neg.patience > 50 ? 'var(--positive)' : neg.patience > 20 ? '#e2b93b' : 'var(--negative)' }} />
            </div>
            <div className={styles.rivals}>{neg.rivals > 0 ? `${neg.rivals} team${neg.rivals > 1 ? 's' : ''} interested` : 'No known rival interest'}</div>
            <div className={styles.round}>Round {neg.round}/6</div>
          </div>
          <div className={styles.right}>
            <div className={styles.log}>
              {neg.log.map((entry, i) => (
                <div key={i} className={entry.by === 'team' ? `${styles.bubbleTeam} slide-in-right` : `${styles.bubbleAgent} slide-in-right`}>{entry.text}</div>
              ))}
            </div>
            {open ? (
              <div className={styles.builder}>
                <label className={styles.field}>
                  <span>Salary: {formatMoney(amount)} <span className={styles.askMarker}>(asking {formatMoneyShort(neg.ask.amount)})</span></span>
                  <input type="range" min={min} max={max} step={10_000} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
                </label>
                <label className={styles.field}>
                  <span>Years: {years}</span>
                  <input type="range" min={1} max={5} step={1} value={years} onChange={(e) => setYears(Number(e.target.value))} />
                </label>
                <label className={styles.field}>
                  <span>Incentives: {formatMoneyShort(incentives)}</span>
                  <input type="range" min={0} max={5_000_000} step={250_000} value={incentives} onChange={(e) => setIncentives(Number(e.target.value))} />
                </label>
                <div className={styles.toggles}>
                  <label className={styles.checkField}>
                    <input type="checkbox" checked={playerOption} onChange={(e) => { setPlayerOption(e.target.checked); if (e.target.checked) setTeamOption(false); }} /> Player option (final year)
                  </label>
                  <label className={styles.checkField}>
                    <input type="checkbox" checked={teamOption} onChange={(e) => { setTeamOption(e.target.checked); if (e.target.checked) setPlayerOption(false); }} /> Team option (final year)
                  </label>
                </div>
                <div className={capBad ? styles.legalBad : styles.legalOk}>{capLine}</div>
                <div className={styles.builderBtns}>
                  <button type="button" className={styles.cancelBtn} onClick={onClose}>Close</button>
                  <button type="button" className={styles.submitBtn} disabled={capBad} onClick={submit}>Submit offer</button>
                </div>
              </div>
            ) : (
              <div className={neg.status === 'signed' ? styles.resultGood : styles.resultBad}>
                {neg.status === 'signed' ? 'Deal signed.' : 'Talks broke down — he has walked away from the table.'}
                <button type="button" className={styles.doneBtn} onClick={onClose}>Done</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
