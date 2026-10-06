import { useState } from 'react';
import HeroHeader from '../components/HeroHeader';
import Panel from '../components/Panel';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import TeamBadge from '../components/TeamBadge';
import ProgressBar from '../components/ProgressBar';
import ConfirmDialog from '../components/ConfirmDialog';
import { useGame, useGameState } from '../store/useGame';
import { useUI } from '../store/useUI';
import { acceptJob, resignPost } from '../../engine/manager';
import { objectiveLabel } from '../../engine/mgmt/board';
import type { GameState, JobOffer } from '../../engine/model';
import { formatDate, formatMoneyShort } from '../format';
import { toast } from '../components/Toasts';
import styles from './CareerScreen.module.css';

function hotSeatState(v: number): { label: string; color: string; variant: 'positive' | 'cyan' | 'negative' } {
  if (v >= 70) return { label: 'On the brink', color: 'var(--negative)', variant: 'negative' };
  if (v >= 35) return { label: 'Under pressure', color: '#e2b93b', variant: 'cyan' };
  return { label: 'Safe', color: 'var(--positive)', variant: 'positive' };
}

function ReputationRing({ value }: { value: number }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <svg viewBox="0 0 68 68" className={styles.ring}>
      <circle cx="34" cy="34" r={r} className={styles.ringTrack} />
      <circle cx="34" cy="34" r={r} className={styles.ringFill} strokeDasharray={c} strokeDashoffset={off} />
      <text x="34" y="39" textAnchor="middle" className={styles.ringText}>{Math.round(value)}</text>
    </svg>
  );
}

function OfferCard({ s, offer, onAccept }: { s: GameState; offer: JobOffer; onAccept: () => void }) {
  const team = s.teams[offer.teamId];
  return (
    <div className={styles.offerCard}>
      <div className={styles.offerHead}>
        <TeamBadge logoPath={team?.logo ?? null} name={`${team?.city ?? ''} ${team?.name ?? ''}`} />
        <button type="button" className={styles.acceptBtn} onClick={onAccept}>Accept</button>
      </div>
      <div className={styles.offerMeta}>
        <span>League <b>{offer.league}</b></span>
        <span>Objective <b>{objectiveLabel(offer.objective)}</b></span>
        <span>Salary <b>{formatMoneyShort(offer.salary)}/yr</b></span>
        <span>Years <b>{offer.years}</b></span>
        <span>Budget <b>{formatMoneyShort(offer.budget)}</b></span>
      </div>
      <div className={styles.offerReason}>{offer.reason}</div>
      <div className={styles.expiry}>Expires {formatDate(offer.expires)}</div>
    </div>
  );
}

export default function CareerScreen() {
  const s = useGameState();
  const mutate = useGame((g) => g.mutate);
  const setTab = useUI((u) => u.setTab);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);

  if (!s) return null;
  const m = s.manager;
  const team = m.unemployed ? null : s.teams[s.userTeamId];
  const hs = hotSeatState(m.hotSeat);

  const commitName = () => {
    if (nameDraft != null && nameDraft.trim() && nameDraft.trim() !== m.name) {
      mutate((st) => { st.manager.name = nameDraft.trim(); });
    }
    setNameDraft(null);
  };

  const accept = (offerId: number) => {
    let err: string | null = null;
    mutate((st) => { err = acceptJob(st, offerId); });
    if (err) toast(err, 'error');
    else { toast('You have a new job.', 'success'); setTab('home'); }
  };

  const doResign = () => {
    mutate((st) => { resignPost(st); });
    setConfirmResign(false);
    toast('You have resigned.', 'info');
  };

  const historyRows = m.history.map((h, idx) => ({ ...h, idx }));
  const historyColumns: DataTableColumn<(typeof historyRows)[number]>[] = [
    { key: 'club', header: 'Club', render: (h) => s.teams[h.teamId]?.name ?? h.teamId },
    { key: 'period', header: 'Period', render: (h) => `${formatDate(h.from)} – ${h.to ? formatDate(h.to) : 'Present'}` },
    { key: 'record', header: 'Record', align: 'right', render: (h) => h.record },
    { key: 'result', header: 'Result', render: (h) => h.result },
  ];

  return (
    <div className={styles.screen}>
      <HeroHeader title="Career" subtitle={m.unemployed ? 'Between jobs' : `${team!.city} ${team!.name}`} />
      <div className={styles.body}>
        <Panel title="Manager profile" className={styles.leftPanel}>
          <div className={styles.profileTop}>
            <ReputationRing value={m.reputation} />
            <div className={styles.profileInfo}>
              <input
                className={styles.nameInput}
                value={nameDraft ?? m.name}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              />
              {team ? (
                <TeamBadge logoPath={team.logo} name={`${team.city} ${team.name}`} />
              ) : (
                <div className={styles.unemployedBadge}>Unemployed</div>
              )}
            </div>
          </div>

          {!m.unemployed && (
            <>
              <div className={styles.statRow}><span>Salary</span><span>{formatMoneyShort(m.salary)}/yr</span></div>
              <div className={styles.statRow}><span>Contract</span><span>{m.contractYears} yr{m.contractYears === 1 ? '' : 's'}</span></div>
              <div className={styles.statRow}><span>Tenure since</span><span>{formatDate(m.hiredOn)}</span></div>

              <div className={styles.divider} />
              <div className={styles.gaugeHead}><span>Hot seat</span><span style={{ color: hs.color }}>{hs.label}</span></div>
              <ProgressBar value={m.hotSeat} variant={hs.variant} />

              <div className={styles.divider} />
              <div className={styles.statRow}><span>Season objective</span><span>{objectiveLabel(s.board.objective)}</span></div>
              <div className={styles.statRow}><span>Board confidence</span><span>{Math.round(s.board.confidence)}</span></div>

              <button type="button" className={styles.resignBtn} onClick={() => setConfirmResign(true)}>Resign</button>
            </>
          )}
        </Panel>

        <div className={styles.rightCol}>
          <Panel title="Job offers" className={styles.offersPanel} flush headerRight={<span className={styles.count}>{m.offers.length}</span>}>
            {m.offers.length === 0 && <div className={styles.empty}>No offers on the table</div>}
            <div className={styles.offerList}>
              {m.offers.map((o) => <OfferCard key={o.id} s={s} offer={o} onAccept={() => accept(o.id)} />)}
            </div>
          </Panel>
          <Panel title="Career history" className={styles.historyPanel} flush>
            <DataTable
              columns={historyColumns}
              rows={[...historyRows].reverse()}
              rowKey={(h) => String(h.idx)}
              compact
              emptyLabel="No history yet"
            />
          </Panel>
        </div>
      </div>

      {confirmResign && (
        <ConfirmDialog
          title="Resign from your post?"
          message={`You will leave ${team?.name}. Your reputation will take a small hit and you'll need a new offer to get back into work.`}
          confirmLabel="Resign"
          danger
          onConfirm={doResign}
          onCancel={() => setConfirmResign(false)}
        />
      )}
    </div>
  );
}
