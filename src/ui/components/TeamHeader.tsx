import type { CSSProperties, ReactNode } from 'react';
import type { GameState, Session } from '../../engine/model';
import { addDays } from '../../engine/schedule';
import { sessionOn } from '../../engine/training';
import { leagueOf } from '../../engine/leagues';
import { offseasonStageLabel } from '../../engine/offseason';
import { standings } from '../../engine/season';
import BkImage from './BkImage';
import { formatMoneyShort } from '../format';
import styles from './TeamHeader.module.css';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SESSION_SHORT: Record<Session, string> = { high: 'High', light: 'Light', shootaround: 'Shoot', film: 'Film', rest: 'Rest' };

interface Props { s: GameState; continueSlot: ReactNode }

function Kpi({ label, value, pct, tone }: { label: string; value: string; pct?: number; tone?: 'good' | 'bad' }) {
  return (
    <div className={styles.kpi}>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={`${styles.kpiValue} mono-num ${tone === 'good' ? styles.good : tone === 'bad' ? styles.bad : ''}`}>{value}</span>
      {pct != null && <span className={styles.kpiBar}><span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></span>}
    </div>
  );
}

/** Shell header: club identity, the week ahead, key club numbers and the Continue button. */
export default function TeamHeader({ s, continueSlot }: Props) {
  const team = s.teams[s.userTeamId];
  const league = leagueOf(team.league);
  const unemployed = s.manager.unemployed;
  const table = standings(s, league.id === 'NBA' ? team.conference : undefined);
  const row = table.find((r) => r.teamId === team.id);
  const pos = row ? table.indexOf(row) + 1 : 0;
  const streak = row?.streak ?? 0;

  const days = Array.from({ length: 7 }, (_, i) => addDays(s.date, i));
  const gameOn = (d: string) => s.games.find((g) => g.date === d && (g.home === team.id || g.away === team.id));

  return (
    <header className={styles.header} style={{ '--team-1': team.colors.primary, '--team-2': team.colors.secondary } as CSSProperties}>
      <div className={styles.club}>
        <div className={styles.crestWrap}>
          <BkImage path={team.logo} alt={team.name} className={styles.crest} />
        </div>
        <div className={styles.clubText}>
          <span className={styles.clubName}>{unemployed ? s.manager.name : `${team.city} ${team.name}`}</span>
          <span className={styles.clubMeta}>
            {unemployed ? <span className={styles.chip}>Between jobs</span> : (
              <>
                <span className={styles.chip}>{league.short}</span>
                <span className="mono-num">{s.season}</span>
                {row && <span className="mono-num">{row.w}-{row.l}</span>}
                {row && row.w + row.l > 0 && <span>#{pos} {league.id === 'NBA' ? team.conference : ''}</span>}
                {streak !== 0 && <span className={streak > 0 ? styles.good : styles.bad}>{streak > 0 ? 'W' : 'L'}{Math.abs(streak)}</span>}
              </>
            )}
          </span>
        </div>
      </div>

      <div className={styles.week}>
        {s.phase === 'offseason' ? (
          <div className={styles.offseason}>
            <span className={styles.offLabel}>Offseason</span>
            <span className={styles.offStage}>{offseasonStageLabel(s)}</span>
          </div>
        ) : days.map((d, i) => {
          const g = unemployed ? undefined : gameOn(d);
          const opp = g ? s.teams[g.home === team.id ? g.away : g.home] : null;
          const dow = DOW[new Date(`${d}T00:00:00Z`).getUTCDay()];
          const session = !g && !unemployed ? sessionOn(s, team.id, d) : null;
          return (
            <div key={d} className={`${styles.day} ${i === 0 ? styles.today : ''} ${g ? styles.gameDay : ''}`}>
              <span className={styles.dow}>{i === 0 ? 'Today' : dow}</span>
              <span className={`${styles.dnum} mono-num`}>{Number(d.slice(8))}</span>
              {opp ? (
                <span className={styles.dayGame}>
                  <span className={styles.ha}>{g!.home === team.id ? 'vs' : '@'}</span>
                  <BkImage path={opp.logo} alt={opp.abbr} className={styles.oppLogo} />
                </span>
              ) : (
                <span className={`${styles.session} ${session ? styles[`s_${session}`] : ''}`}>{session ? SESSION_SHORT[session] : '—'}</span>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.kpis}>
        <Kpi label="Cash" value={formatMoneyShort(s.finance.cash)} tone={s.finance.cash < 0 ? 'bad' : undefined} />
        <Kpi label="Board" value={`${Math.round(s.board.confidence)}%`} pct={s.board.confidence} tone={s.board.confidence < 35 ? 'bad' : undefined} />
        <Kpi label="Fans" value={`${Math.round(s.finance.hype ?? 50)}`} pct={s.finance.hype ?? 50} />
        <Kpi label="Chemistry" value={`${Math.round(team.chemistry ?? 55)}`} pct={team.chemistry ?? 55} tone={(team.chemistry ?? 55) < 40 ? 'bad' : (team.chemistry ?? 55) >= 70 ? 'good' : undefined} />
      </div>

      <div className={styles.cont}>{continueSlot}</div>
    </header>
  );
}
