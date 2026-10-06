import HeroHeader from '../components/HeroHeader';
import Panel from '../components/Panel';
import BkImage from '../components/BkImage';
import { useGameState } from '../store/useGame';
import { useUI } from '../store/useUI';
import { formatDate } from '../format';
import { cupGroupTable } from '../../engine/calendar';
import type { CupRound, CupTie, GameState } from '../../engine/model';
import styles from './MomentsScreen.module.css';

const ROUND: Record<CupRound, string> = { qf: 'Quarter-finals', sf: 'Semi-finals', final: 'Final' };
const short = (d: string) => formatDate(d).replace(/, \d{4}$/, '');

function Timeline({ s }: { s: GameState }) {
  const c = s.calendar!;
  const cup = c.cup!, as = c.allStar!;
  const qf = cup.knockout.find((t) => t.round === 'qf');
  const qfDate = qf ? s.games.find((g) => g.id === qf.gameId)?.date : undefined;
  const steps: { label: string; when: string; date: string; done: boolean }[] = [
    { label: 'Cup group stage', when: `${short(cup.nights[0])} to ${short(cup.nights[cup.nights.length - 1])}`, date: cup.nights[cup.nights.length - 1], done: cup.knockout.length > 0 },
    { label: 'Cup knockouts', when: qfDate ? `From ${short(qfDate)}` : 'Early December', date: qfDate ?? '9999', done: !!cup.champion },
    { label: 'All-Star selection', when: short(as.selectionDate), date: as.selectionDate, done: !!as.east },
    { label: 'Trade deadline', when: short(s.keyDates.tradeDeadline), date: s.keyDates.tradeDeadline, done: !!c.deadline.done },
    { label: 'All-Star weekend', when: `${short(as.breakStart)} to ${short(as.breakEnd)}`, date: as.gameDate, done: !!as.result },
    { label: 'Awards night', when: 'After the regular season', date: s.keyDates.regularEnd, done: !!c.awards },
  ];
  const next = steps.findIndex((x) => !x.done);
  return (
    <div className={styles.timeline}>
      {steps.map((x, i) => (
        <div key={x.label} className={`${styles.step} ${x.done ? styles.stepDone : ''} ${i === next ? styles.stepNext : ''}`}>
          <span className={styles.stepBar} />
          <span className={styles.stepLabel}>{x.label}</span>
          <span className={styles.stepWhen}>{x.done ? 'Done' : x.when}</span>
        </div>
      ))}
    </div>
  );
}

function Groups({ s }: { s: GameState }) {
  const cup = s.calendar!.cup!;
  return (
    <div className={styles.groups}>
      {cup.groups.map((g) => (
        <div key={g.id} className={styles.group}>
          <div className={styles.groupHead}><span>{g.id}</span><span>W–L</span><span>PD</span></div>
          {cupGroupTable(s, g).map((r, i) => {
            const t = s.teams[r.teamId];
            return (
              <div key={r.teamId} className={`${styles.gRow} ${r.teamId === s.userTeamId ? styles.mine : ''} ${i === 0 && r.gp ? styles.leader : ''}`}>
                <span className={styles.gTeam}><BkImage path={t.logo} alt={t.abbr} className={styles.logo} />{t.name}</span>
                <span>{r.w}–{r.l}</span>
                <span className={r.pd > 0 ? styles.pos : r.pd < 0 ? styles.neg : ''}>{r.pd > 0 ? '+' : ''}{r.pd}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Tie({ s, t }: { s: GameState; t: CupTie }) {
  const g = s.games.find((x) => x.id === t.gameId);
  const side = (id: string, score?: number) => {
    const team = s.teams[id];
    return (
      <span className={`${styles.tieSide} ${t.winner === id ? styles.tieWin : t.winner ? styles.tieOut : ''} ${id === s.userTeamId ? styles.mine : ''}`}>
        <BkImage path={team.logo} alt={team.abbr} className={styles.logo} />
        <span className={styles.tieName}>{team.name}</span>
        <span className={`${styles.tieScore} numeral`}>{score ?? ''}</span>
      </span>
    );
  };
  return (
    <div className={styles.tie}>
      {side(t.high, g?.result?.home)}
      {side(t.low, g?.result?.away)}
      <span className={styles.tieDate}>{g ? (g.result ? 'Final' : short(g.date)) : ''}</span>
    </div>
  );
}

function Bracket({ s }: { s: GameState }) {
  const cup = s.calendar!.cup!;
  if (!cup.knockout.length) return <p className={styles.note}>Three group winners and the best runner-up in each conference go through. Quarter-finals are hosted by the higher seed; the semi-finals and final are played in Las Vegas.</p>;
  const champ = cup.champion ? s.teams[cup.champion] : null;
  const mvp = cup.mvp ? s.players[cup.mvp] : null;
  return (
    <>
      <div className={styles.bracket}>
        {(['qf', 'sf', 'final'] as const).map((r) => (
          <div key={r} className={styles.round}>
            <span className={styles.roundLabel}>{ROUND[r]}</span>
            {cup.knockout.filter((t) => t.round === r).map((t) => <Tie key={t.id} s={s} t={t} />)}
          </div>
        ))}
      </div>
      {champ && (
        <div className={styles.champ}>
          <BkImage path={champ.logo} alt={champ.abbr} className={styles.champLogo} />
          <span>
            <span className={`${styles.champName} wordmark`}>{champ.name}</span>
            <span className={styles.champSub}>NBA Cup champions{mvp ? `, MVP ${mvp.firstName} ${mvp.lastName}` : ''}</span>
          </span>
        </div>
      )}
    </>
  );
}

function AllStar({ s }: { s: GameState }) {
  const as = s.calendar!.allStar!;
  const openPlayer = useUI((u) => u.openPlayer);
  if (!as.east) return <p className={styles.note}>Rosters are announced on {formatDate(as.selectionDate)}. The game is on {formatDate(as.gameDate)}, and nobody plays from {short(as.breakStart)} to {short(as.breakEnd)}.</p>;
  const roster = (label: string, ids: string[]) => (
    <div className={styles.asCol}>
      <span className={styles.asHead}>{label}</span>
      {ids.map((id, i) => {
        const p = s.players[id];
        const t = p.teamId ? s.teams[p.teamId] : null;
        return (
          <button key={id} type="button" className={`${styles.asRow} ${p.teamId === s.userTeamId ? styles.mine : ''} ${i === 5 ? styles.asBench : ''}`} onClick={() => openPlayer(id)}>
            <BkImage path={p.face} alt={p.lastName} className={styles.face} />
            <span className={styles.asName}>{p.firstName[0]}. {p.lastName}</span>
            <span className={styles.asTeam}>{t?.abbr}</span>
          </button>
        );
      })}
    </div>
  );
  const r = as.result;
  const name = (id: string) => `${s.players[id].firstName} ${s.players[id].lastName}`;
  return (
    <>
      {r && (
        <div className={styles.asResult}>
          <span className={`${styles.asScore} numeral`}>East {r.east}, West {r.west}</span>
          <span>MVP {name(r.mvp)}</span>
          <span>Three-point contest: {name(r.threes)}</span>
          <span>Slam dunk contest: {name(r.dunk)}</span>
        </div>
      )}
      <div className={styles.asCols}>
        {roster('East', as.east)}
        {roster('West', as.west!)}
      </div>
    </>
  );
}

function Awards({ s }: { s: GameState }) {
  const a = s.calendar!.awards;
  if (!a) return <p className={styles.note}>Awards are announced the night the regular season ends, including Coach of the Year: the coach whose team beat its preseason expectations by the most.</p>;
  const r = a.result;
  const rows: [string, string | null][] = [['Most Valuable Player', r.mvp], ['Defensive Player', r.dpoy], ['Rookie of the Year', r.roy], ['Sixth Man', r.sixth], ['Most Improved', r.mip]];
  const coy = r.coy ? s.teams[r.coy] : null;
  return (
    <div className={styles.awards}>
      {rows.map(([label, id]) => {
        const p = id ? s.players[id] : null;
        return (
          <div key={label} className={`${styles.award} ${p?.teamId === s.userTeamId ? styles.mine : ''}`}>
            <BkImage path={p?.face ?? null} alt={p?.lastName ?? label} className={styles.face} />
            <span className={styles.awardLabel}>{label}</span>
            <span className={styles.awardName}>{p ? `${p.firstName} ${p.lastName}` : 'Not awarded'}</span>
          </div>
        );
      })}
      {coy && (
        <div className={`${styles.award} ${coy.id === s.userTeamId ? styles.mine : ''}`}>
          <BkImage path={coy.logo} alt={coy.abbr} className={styles.face} />
          <span className={styles.awardLabel}>Coach of the Year</span>
          <span className={styles.awardName}>{coy.id === s.userTeamId ? 'You' : `${coy.city} ${coy.name} head coach`}</span>
        </div>
      )}
    </div>
  );
}

/** The NBA's season set pieces: the Cup, All-Star weekend, the trade deadline and awards night. */
export default function MomentsScreen() {
  const s = useGameState();
  if (!s?.calendar?.cup) return null;
  return (
    <div className={styles.screen}>
      <HeroHeader title="Season moments" subtitle="NBA Cup, All-Star weekend, the deadline and awards night" />
      <Timeline s={s} />
      <div className={styles.grid}>
        <div className={styles.col}>
          <Panel title="NBA Cup groups"><Groups s={s} /></Panel>
          <Panel title="NBA Cup knockouts"><Bracket s={s} /></Panel>
        </div>
        <div className={styles.col}>
          <Panel title="All-Star weekend"><AllStar s={s} /></Panel>
          <Panel title="Awards night"><Awards s={s} /></Panel>
        </div>
      </div>
    </div>
  );
}
