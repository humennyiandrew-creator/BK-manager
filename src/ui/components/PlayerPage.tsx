import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Attr } from '../../engine/ratings';
import type { GameState, Player } from '../../engine/model';
import { ageOf } from '../../engine/ratings';
import { canMeet } from '../../engine/meetings';
import { freeAgents, releasePlayer } from '../../engine/freeagency';
import { isTwoWay, marketValue, salaryIn, yearsLeft } from '../../engine/cba';
import { extensionEligible, type NegKind } from '../../engine/negotiation';
import { expiring } from '../../engine/offseason';
import { scoutView } from '../../engine/draft';
import { availablePrograms, startProgram, type ProgramOption } from '../../engine/programs';
import { teamRoster } from '../selectors';
import { ATTR_GROUPS, ATTR_LABEL, attrVariant, scoutAttrValue } from '../attrGroups';
import { formatDate, formatMoney, formatMoneyShort, heightFtIn, perGame } from '../format';
import { moraleLabel, formChip, formExplanation, deadCapAmount } from '../screens/RosterScreen';
import { useGame } from '../store/useGame';
import { useUI } from '../store/useUI';
import BkImage from './BkImage';
import Silhouette from './Silhouette';
import ProgressBar from './ProgressBar';
import Sparkline from './Sparkline';
import ConfirmDialog from './ConfirmDialog';
import MeetingDialog from './MeetingDialog';
import NegotiationModal from './NegotiationModal';
import TeamBadge from './TeamBadge';
import ArcBadge from './hub/ArcBadge';
import { ARC_LABEL } from '../../engine/arcs';
import { affiliateName, assign, canAssign, recall } from '../../engine/gleague';
import { uniform } from './shell/teamColors';
import { TIER_LABEL, playerRival, tierOf } from '../../engine/rivalries';
import { toast } from './Toasts';
import { play } from '../sound';
import styles from './PlayerPage.module.css';

type Tab = 'attributes' | 'season' | 'career' | 'development' | 'contract';
const TABS: { id: Tab; label: string }[] = [
  { id: 'attributes', label: 'Attributes' },
  { id: 'season', label: 'Season' },
  { id: 'career', label: 'Career' },
  { id: 'development', label: 'Development' },
  { id: 'contract', label: 'Contract' }
];

interface Props { s: GameState; playerId: string; onClose: () => void }

function leaguePercentile(s: GameState, attr: Attr, value: number): number {
  const pool = Object.values(s.players)
    .filter((x) => x.teamId && !x.retired)
    .map((x) => x.ratings.attrs[attr]);
  if (pool.length === 0) return 50;
  const below = pool.filter((v) => v < value).length;
  return Math.round((below / pool.length) * 100);
}

export default function PlayerPage({ s, playerId, onClose }: Props) {
  const mutate = useGame((g) => g.mutate);
  const setAppTab = useUI((u) => u.setTab);
  const openPlayer = useUI((u) => u.openPlayer);
  const [tab, setTab] = useState<Tab>('attributes');
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [meetOpen, setMeetOpen] = useState(false);
  const [negKind, setNegKind] = useState<NegKind | null>(null);
  const [programPicker, setProgramPicker] = useState(false);

  const p: Player | undefined = s.players[playerId];

  const navList = useMemo(() => {
    if (!p) return [] as Player[];
    if (p.prospect) return s.draftClass.map((id) => s.players[id]).filter(Boolean).sort((a, b) => b.ratings.pot - a.ratings.pot);
    if (p.teamId) return teamRoster(s, p.teamId).sort((a, b) => b.ratings.ovr - a.ratings.ovr);
    return freeAgents(s).sort((a, b) => b.ratings.ovr - a.ratings.ovr);
  }, [s, p]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (releaseOpen || meetOpen || negKind || programPicker) return;
      if (e.key === 'Escape') { onClose(); return; }
      if (!p) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const idx = navList.findIndex((x) => x.id === p.id);
        if (idx < 0) return;
        const next = e.key === 'ArrowLeft' ? navList[idx - 1] : navList[idx + 1];
        if (next) openPlayer(next.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id, navList, releaseOpen, meetOpen, negKind, programPicker]);

  if (!p) return null;

  const team = p.teamId ? s.teams[p.teamId] : null;

  const kit = team ? uniform(team.colors.primary, team.colors.secondary) : null;

  const jersey = (kit ? { '--pteam': kit.team, '--pteam-2': kit.trim, '--pink': kit.ink } : {}) as CSSProperties;
  const age = Math.floor(ageOf(p.birthDate, new Date(s.date)));
  const isUserPlayer = p.teamId === s.userTeamId;
  const isFa = !p.teamId && !p.prospect;

  const scouted = p.prospect ? scoutView(s, p.id, s.userTeamId) : null;
  const displayOvr = scouted ? scouted.ovr : p.ratings.ovr;
  const displayPot = scouted ? scouted.pot : Math.round(p.ratings.pot);

  const meetOk = isUserPlayer && canMeet(s, p.id);
  const extEligible = isUserPlayer && extensionEligible(s).includes(p);
  const resignEligible = isUserPlayer && s.offseason?.stage === 'resign' && expiring(s, s.userTeamId).includes(p);
  const canStartProgram = isUserPlayer && !p.program && teamRoster(s, s.userTeamId).filter((x) => x.program).length < 3;

  const negotiateLabel = extEligible ? 'Extend' : resignEligible ? 'Re-sign' : isFa ? 'Sign' : 'Negotiate';
  const negotiateEnabled = extEligible || resignEligible || isFa;

  const onNegotiate = () => {
    if (extEligible) { setNegKind('extension'); return; }
    if (resignEligible) { setNegKind('resign'); return; }
    if (isFa) { setNegKind('fa'); return; }
    setTab('contract');
  };

  const onProgram = () => {
    if (p.program || !canStartProgram) { setTab('development'); return; }
    setProgramPicker(true);
  };

  const goto = (idx: number) => {
    const next = navList[idx];
    if (next) openPlayer(next.id);
  };
  const curIdx = navList.findIndex((x) => x.id === p.id);

  return (
    <div className={`${styles.backdrop} fade-in`} onClick={onClose}>
      <div className={styles.page} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">&times;</button>
        {curIdx > 0 && <button type="button" className={`${styles.navBtn} ${styles.navPrev}`} onClick={() => goto(curIdx - 1)} aria-label="Previous player">&#10094;</button>}
        {curIdx >= 0 && curIdx < navList.length - 1 && <button type="button" className={`${styles.navBtn} ${styles.navNext}`} onClick={() => goto(curIdx + 1)} aria-label="Next player">&#10095;</button>}

        <div className={styles.body}>
          <div className={styles.leftCol}>
            <div className={styles.slab} style={jersey}>
              <span className={`${styles.jerseyWatermark} numeral`}>{p.jersey}</span>
              <div className={styles.photoWrap}>
                {p.face ? <BkImage path={p.face} alt={p.lastName} className={styles.photo} /> : <Silhouette className={styles.photo} />}
              </div>
              <div className={styles.nameBlock}>
                <span className={styles.firstName}>{p.firstName}</span>
                <span className={`${styles.lastName} wordmark`}>{p.lastName}</span>
              </div>
              <div className={styles.metaLine}>
                {p.positions.join('/')}, {age}y, {heightFtIn(p.heightCm)}, {p.weightKg}kg, {p.country}
              </div>
              {team && (
                <TeamBadge logoPath={team.logo} name={`${team.city} ${team.name}`} className={styles.teamBadge} />
              )}
              {p.prospect && <div className={styles.metaLine}>{p.college ?? 'International'}, draft prospect</div>}
              {p.assigned && p.teamId && <div className={styles.metaLine}>On assignment with the {affiliateName(s, p.teamId)}</div>}
              {(() => { const r = playerRival(s, p.id); const q = r && s.players[r.rivalId]; return r && q ? <div className={styles.metaLine}>{TIER_LABEL[tierOf(r.heat)]} with {q.firstName} {q.lastName}, duels {r.season.w}–{r.season.l}</div> : null; })()}
              {!p.teamId && p.affiliate && !p.prospect && <div className={styles.metaLine}>Playing for the {affiliateName(s, p.affiliate)}</div>}
            </div>

            <div className={styles.ringsRow}>
              <div className={styles.ring}>
                <span className={styles.ringValue}>{displayOvr}{scouted ? `±${scouted.range}` : ''}</span>
                <span className={styles.ringLabel}>OVR</span>
              </div>
              <div className={styles.ring}>
                <span className={styles.ringValue}>{displayPot}{scouted ? `±${scouted.range}` : ''}</span>
                <span className={styles.ringLabel}>POT</span>
              </div>
              {!p.prospect && (() => { const f = formChip(p.form); return (
                <div className={styles.ring}>
                  <span className={`${styles.ringValue} ${styles[f.variant]}`}>{f.icon}</span>
                  <span className={styles.ringLabel}>Form</span>
                </div>
              ); })()}
            </div>

            {!p.prospect && p.arc?.revealed && p.arc.season === s.season && (
              <div className={styles.arcRow}><ArcBadge arc={p.arc} season={s.season} showLabel /></div>
            )}

            {!p.prospect && (
              <div className={styles.moraleBlock}>
                <div className={styles.moraleHead}>
                  <span>Morale</span>
                  <span className={styles[moraleLabel(p.morale).variant]}>{moraleLabel(p.morale).text}</span>
                </div>
                <ProgressBar value={p.morale} variant={moraleLabel(p.morale).variant === 'positive' ? 'positive' : moraleLabel(p.morale).variant === 'negative' ? 'negative' : 'muted'} />
              </div>
            )}

            {p.contract && !p.prospect && (
              <div className={styles.contractSummary}>
                <div className={styles.contractRow}><span>Salary</span><span>{formatMoneyShort(salaryIn(p, s.season))}</span></div>
                <div className={styles.contractRow}><span>Years left</span><span>{isTwoWay(p) ? 'Two-way' : `${yearsLeft(p, s.season)}y`}</span></div>
                {p.contract.option && <div className={styles.contractRow}><span>Option</span><span>{p.contract.option.season} ({p.contract.option.kind})</span></div>}
              </div>
            )}
            {!p.contract && !p.prospect && <div className={styles.contractSummary}><div className={styles.contractRow}><span>Contract</span><span>None</span></div></div>}

            {isUserPlayer && (
              <div className={styles.actions}>
                <button type="button" className={styles.actionBtn} disabled={!meetOk} title={meetOk ? '1-on-1 meeting' : 'Met with him recently'} onClick={() => setMeetOpen(true)}>1-on-1</button>
                <button type="button" className={styles.actionBtn} onClick={onProgram}>{p.program ? 'View programme' : 'Start programme'}</button>
                <button type="button" className={styles.actionBtn} onClick={onNegotiate}>{negotiateEnabled ? negotiateLabel : 'Contract'}</button>
                {p.assigned
                  ? <button type="button" className={styles.actionBtn} onClick={() => mutate((st) => { const e = recall(st, p.id); toast(e ?? `${p.lastName} recalled`, e ? 'error' : 'success'); })}>Recall</button>
                  : canAssign(s, p) && <button type="button" className={styles.actionBtn} onClick={() => mutate((st) => { const e = assign(st, p.id); toast(e ?? `${p.lastName} sent to the ${affiliateName(st, st.userTeamId)}`, e ? 'error' : 'success'); })}>Send down</button>}
                <button type="button" className={`${styles.actionBtn} ${styles.danger}`} onClick={() => setReleaseOpen(true)}>Release</button>
              </div>
            )}
            {isFa && (
              <div className={styles.actions}>
                <button type="button" className={styles.actionBtn} onClick={onNegotiate}>Sign</button>
              </div>
            )}
          </div>

          <div className={styles.rightCol}>
            <div className={styles.tabBar}>
              {TABS.map((t) => (
                <button key={t.id} type="button" className={t.id === tab ? `${styles.tabBtn} ${styles.tabBtnActive}` : styles.tabBtn} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className={styles.tabContent}>
              {tab === 'attributes' && <AttributesTab s={s} p={p} scoutedRange={scouted?.range} />}
              {tab === 'season' && <SeasonTab s={s} p={p} />}
              {tab === 'career' && <CareerTab p={p} />}
              {tab === 'development' && <DevelopmentTab s={s} p={p} />}
              {tab === 'contract' && <ContractTab s={s} p={p} />}
            </div>
          </div>
        </div>
      </div>

      {meetOpen && <MeetingDialog s={s} playerId={p.id} mutate={mutate} onClose={() => setMeetOpen(false)} />}
      {negKind && <NegotiationModal s={s} mutate={mutate} playerId={p.id} kind={negKind} onClose={() => setNegKind(null)} />}
      {programPicker && (
        <ProgramPickerModal
          s={s}
          playerId={p.id}
          onClose={() => setProgramPicker(false)}
          onStart={(pid, option) => {
            mutate((st) => {
              const err = startProgram(st, pid, option);
              if (err) toast(err, 'error'); else toast('Programme started', 'success');
            });
            setProgramPicker(false);
          }}
        />
      )}
      {releaseOpen && (
        <ConfirmDialog
          title={`Release ${p.firstName} ${p.lastName}?`}
          message={`Remaining salary stays on the books as dead cap: ${formatMoney(deadCapAmount(p, s.season))}.`}
          confirmLabel="Release"
          danger
          onCancel={() => setReleaseOpen(false)}
          onConfirm={() => { mutate((st) => releasePlayer(st, p.id)); setReleaseOpen(false); onClose(); }}
        />
      )}
    </div>
  );
}

function ProgramPickerModal({ s, playerId, onClose, onStart }: {
  s: GameState; playerId: string; onClose: () => void; onStart: (playerId: string, option: ProgramOption) => void;
}) {
  const options = availablePrograms(s, playerId);
  const [idx, setIdx] = useState(0);
  const option = options[idx];
  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.pickerModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.pickerTitle}>Start a Development Programme</div>
        <div className={styles.pickerList}>
          {options.map((o, i) => (
            <button key={i} type="button" className={i === idx ? `${styles.pickerOpt} ${styles.pickerOptActive}` : styles.pickerOpt} onClick={() => setIdx(i)}>
              <span>{o.label}</span>
              <span className={styles.pickerMeta}>{o.weeks} weeks, +{o.expectedGain} expected, {Math.round(o.risk * 100)}% risk</span>
            </button>
          ))}
        </div>
        <div className={styles.pickerBtns}>
          <button type="button" className={styles.actionBtn} onClick={onClose}>Cancel</button>
          <button type="button" className={`${styles.actionBtn} ${styles.primary}`} disabled={!option} onClick={() => { if (option) { onStart(playerId, option); play('confirm'); } }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

function AttributesTab({ s, p, scoutedRange }: { s: GameState; p: Player; scoutedRange?: number }) {
  return (
    <div className={styles.attrGrid}>
      {ATTR_GROUPS.map((g) => (
        <div key={g.label} className={styles.attrGroup}>
          <div className={styles.sectionTitle}>{g.label}</div>
          {g.attrs.map((a) => {
            const raw = scoutedRange != null ? scoutAttrValue(s, p.id, s.userTeamId, a, scoutedRange) : Math.round(p.ratings.attrs[a]);
            const pctl = leaguePercentile(s, a, raw);
            return (
              <div key={a} className={styles.attrRow}>
                <span className={styles.attrLabel}>{ATTR_LABEL[a]}</span>
                <div className={styles.attrBarWrap}>
                  <ProgressBar value={raw} variant={attrVariant(raw)} className={styles.attrBar} />
                  <span className={styles.pctlMarker} style={{ left: `${pctl}%` }} title={`${pctl}th percentile`} />
                </div>
                <span className={styles.attrValue}>{raw}{scoutedRange != null ? `±${scoutedRange}` : ''}</span>
              </div>
            );
          })}
        </div>
      ))}
      <div className={styles.pctlLegend}>Marker shows league percentile among rostered players.</div>
    </div>
  );
}

function SeasonTab({ s, p }: { s: GameState; p: Player }) {
  const games = useMemo(() => {
    if (!p.teamId) return [];
    return s.games
      .filter((g) => g.result?.box && (g.home === p.teamId || g.away === p.teamId))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 15)
      .map((g) => {
        const box = g.result!.box!;
        const line = [...box.home, ...box.away].find((b) => b.id === p.id);
        if (!line) return null;
        const opp = s.teams[g.home === p.teamId ? g.away : g.home];
        const won = g.home === p.teamId ? g.result!.home > g.result!.away : g.result!.away > g.result!.home;
        return { g, opp, line, won };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  }, [s.games, p.teamId, p.id]);

  return (
    <div className={styles.seasonWrap}>
      <div className={styles.statTiles}>
        <div className={styles.statTile}><span className={styles.statVal}>{perGame(p.season.pts, p.season.gp)}</span><span className={styles.statLabel}>PPG</span></div>
        <div className={styles.statTile}><span className={styles.statVal}>{perGame(p.season.orb + p.season.drb, p.season.gp)}</span><span className={styles.statLabel}>RPG</span></div>
        <div className={styles.statTile}><span className={styles.statVal}>{perGame(p.season.ast, p.season.gp)}</span><span className={styles.statLabel}>APG</span></div>
        <div className={styles.statTile}><span className={styles.statVal}>{perGame(p.season.stl, p.season.gp)}</span><span className={styles.statLabel}>SPG</span></div>
        <div className={styles.statTile}><span className={styles.statVal}>{perGame(p.season.blk, p.season.gp)}</span><span className={styles.statLabel}>BPG</span></div>
        <div className={styles.statTile}><span className={styles.statVal}>{p.season.gp}</span><span className={styles.statLabel}>GP</span></div>
      </div>
      <div className={styles.sectionTitle}>Game log</div>
      {games.length === 0 && <div className={styles.empty}>No games played this season.</div>}
      {games.length > 0 && (
        <table className={styles.logTable}>
          <thead><tr><th>Date</th><th>Opp</th><th>Res</th><th>Min</th><th>Pts</th><th>Reb</th><th>Ast</th></tr></thead>
          <tbody>
            {games.map(({ g, opp, line, won }) => (
              <tr key={g.id}>
                <td>{formatDate(g.date)}</td>
                <td>{g.home === p.teamId ? 'vs' : '@'} {opp.abbr}</td>
                <td className={won ? styles.win : styles.loss}>{won ? 'W' : 'L'}</td>
                <td>{line.min}</td>
                <td>{line.pts}</td>
                <td>{line.orb + line.drb}</td>
                <td>{line.ast}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CareerTab({ p }: { p: Player }) {
  return (
    <div className={styles.careerWrap}>
      {p.ovrHistory && p.ovrHistory.length > 1 && (
        <div className={styles.sparkWrap}>
          <div className={styles.sparkCol}>
            <span className={styles.sparkLabel}>OVR</span>
            <Sparkline values={p.ovrHistory.map((h) => h.ovr)} color="var(--accent)" />
          </div>
          <div className={styles.sparkCol}>
            <span className={styles.sparkLabel}>POT</span>
            <Sparkline values={p.ovrHistory.map((h) => h.pot)} color="var(--positive)" />
          </div>
        </div>
      )}
      {!!p.arcHistory?.length && (
        <>
          <div className={styles.sectionTitle}>Defining seasons</div>
          <div className={styles.arcHistory}>
            {p.arcHistory.slice().reverse().map((h) => (
              <div key={h.season} className={styles.arcHistRow}>
                <span>{h.season}</span>
                <span className={h.kind === 'breakout' ? styles.positive : styles.negative}>{h.kind === 'breakout' ? 'Breakout' : 'Slump'}: {ARC_LABEL[h.style]}</span>
                <span className="mono-num">{h.delta > 0 ? '+' : ''}{h.delta} OVR, kept {h.kept > 0 ? '+' : ''}{h.kept}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <div className={styles.sectionTitle}>History</div>
      {p.history.length === 0 && <div className={styles.empty}>No prior seasons on record.</div>}
      {p.history.length > 0 && (
        <table className={styles.logTable}>
          <thead><tr><th>Season</th><th>Team</th><th>GP</th><th>PPG</th><th>RPG</th><th>APG</th></tr></thead>
          <tbody>
            {p.history.map((h) => (
              <tr key={h.season}>
                <td>{h.season}</td><td>{h.team}</td><td>{h.gp}</td>
                <td>{perGame(h.pts, h.gp)}</td><td>{perGame(h.orb + h.drb, h.gp)}</td><td>{perGame(h.ast, h.gp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DevelopmentTab({ s, p }: { s: GameState; p: Player }) {
  const track = p.ovrTrack ?? [];
  const delta = track.length > 1 ? track[track.length - 1] - track[0] : 0;
  const arc = p.arc?.revealed && p.arc.season === s.season ? p.arc : undefined;
  return (
    <div className={styles.devWrap}>
      <div className={styles.sectionTitle}>This season</div>
      <div className={styles.seasonTrend}>
        {track.length > 1 ? <Sparkline values={track} width={220} height={40} color={delta > 0 ? 'var(--positive)' : delta < 0 ? 'var(--negative)' : 'var(--accent)'} /> : <span className={styles.formText}>The trend line builds week by week once the season is under way.</span>}
        {track.length > 1 && <span className={`${styles.trendDelta} ${delta > 0 ? styles.positive : delta < 0 ? styles.negative : ''}`}>{track[0]} to {track[track.length - 1]} ({delta > 0 ? '+' : ''}{delta})</span>}
      </div>
      {arc && (
        <div className={`${styles.arcCard} ${arc.kind === 'breakout' ? styles.arcUp : styles.arcDown}`}>
          <ArcBadge arc={arc} season={s.season} />
          <span className={styles.arcTitle}>{ARC_LABEL[arc.style]}</span>
          <span className={styles.formText}>
            {arc.kind === 'breakout'
              ? 'A rare breakout season. Young players usually keep all of it; veterans give some back over the summer.'
              : arc.locked ? 'The slide has been stopped. He should recover part of it over the summer.' : 'A rare collapse. Young players often bounce back; for veterans it can be the start of the end.'}
          </span>
        </div>
      )}
      <div className={styles.sectionTitle}>Form</div>
      <div className={styles.formRow}>
        {(() => { const f = formChip(p.form); return <span className={styles[f.variant]}>{f.icon} {(p.form ?? 0).toFixed(1)}</span>; })()}
        <span className={styles.formText}>{formExplanation(p.form)}</span>
      </div>
      <div className={styles.sectionTitle}>Potential trend</div>
      <div className={styles.formText}>
        {p.potSeason ? `${p.potSeason > 0 ? 'Rising' : 'Fading'} this season (${p.potSeason > 0 ? '+' : ''}${p.potSeason.toFixed(0)}).` : 'Stable so far this season.'}
      </div>
      <div className={styles.sectionTitle}>Active programme</div>
      {p.program ? (
        <div className={styles.programBlock}>
          <div className={styles.rowHead}>
            <span>{p.program.label}</span>
            <span>{p.program.weeksLeft} wk left</span>
          </div>
          <ProgressBar value={p.program.progress} variant="cyan" />
          <div className={styles.formText}>Risk of setback: {Math.round(p.program.risk * 100)}%</div>
        </div>
      ) : <div className={styles.empty}>No active development programme.</div>}
      {p.devPlan && <div className={styles.formText}>Individual training focus: {ATTR_LABEL[p.devPlan]}</div>}
    </div>
  );
}

function ContractTab({ s, p }: { s: GameState; p: Player }) {
  const mv = marketValue(p, s.seasonYear);
  return (
    <div className={styles.contractWrap}>
      <div className={styles.statTiles}>
        <div className={styles.statTile}><span className={styles.statVal}>{formatMoneyShort(mv)}</span><span className={styles.statLabel}>Market value</span></div>
        <div className={styles.statTile}><span className={styles.statVal}>{p.contract ? `${yearsLeft(p, s.season)}y` : '—'}</span><span className={styles.statLabel}>Years left</span></div>
        <div className={styles.statTile}><span className={styles.statVal}>{p.contract?.type ?? '—'}</span><span className={styles.statLabel}>Type</span></div>
      </div>
      <div className={styles.sectionTitle}>Salary by Season</div>
      {!p.contract && <div className={styles.empty}>No contract on file.</div>}
      {p.contract && (
        <table className={styles.logTable}>
          <thead><tr><th>Season</th><th>Salary</th></tr></thead>
          <tbody>
            {p.contract.salaries.map((row) => (
              <tr key={row.season}>
                <td>{row.season}{p.contract!.option?.season === row.season ? ` (${p.contract!.option!.kind} opt)` : ''}</td>
                <td>{formatMoney(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
