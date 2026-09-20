import { useMemo, useState } from 'react';
import HeroHeader from '../components/HeroHeader';
import Panel from '../components/Panel';
import BkImage from '../components/BkImage';
import { useGameState } from '../store/useGame';
import type { Game } from '../../engine/model';
import styles from './CalendarScreen.module.css';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export default function CalendarScreen() {
  const s = useGameState();
  const [ym, setYm] = useState<{ y: number; m: number } | null>(null);
  const [modalGameId, setModalGameId] = useState<number | null>(null);

  const gamesByDate = useMemo(() => {
    const map = new Map<string, Game>();
    if (s) for (const g of s.games) if (g.home === s.userTeamId || g.away === s.userTeamId) map.set(g.date, g);
    return map;
  }, [s]);

  if (!s) return null;
  const todayDate = new Date(s.date + 'T00:00:00Z');
  const y = ym?.y ?? todayDate.getUTCFullYear();
  const m = ym?.m ?? todayDate.getUTCMonth();

  const firstDow = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const shiftMonth = (delta: number) => {
    let nm = m + delta, ny = y;
    if (nm < 0) { nm = 11; ny--; } else if (nm > 11) { nm = 0; ny++; }
    setYm({ y: ny, m: nm });
  };

  const modalGame = modalGameId != null ? s.games.find((g) => g.id === modalGameId) : null;

  return (
    <div className={styles.screen}>
      <HeroHeader
        title="Calendar"
        subtitle="Season schedule"
        right={
          <div className={styles.nav}>
            <span className={styles.navMonth}>{MONTH_NAMES[m]} {y}</span>
            <button type="button" onClick={() => shiftMonth(-1)}>&#8592;</button>
            <button type="button" onClick={() => setYm({ y: todayDate.getUTCFullYear(), m: todayDate.getUTCMonth() })}>Today</button>
            <button type="button" onClick={() => shiftMonth(1)}>&#8594;</button>
          </div>
        }
      />
      <Panel
        title={`${MONTH_NAMES[m]} ${y}`}
        className={styles.panel}
        flush
      >
        <div className={styles.dowRow}>
          {DOW.map((d) => <div key={d} className={styles.dow}>{d}</div>)}
        </div>
        <div className={styles.grid}>
          {cells.map((d, i) => {
            if (d == null) return <div key={i} className={styles.cellEmpty} />;
            const iso = toIso(y, m, d);
            const g = gamesByDate.get(iso);
            const isToday = iso === s.date;
            const home = g && g.home === s.userTeamId;
            const opp = g ? s.teams[home ? g!.away : g!.home] : null;
            const played = g?.result;
            const won = played && (home ? g!.result!.home > g!.result!.away : g!.result!.away > g!.result!.home);
            return (
              <div key={i} className={isToday ? `${styles.cell} ${styles.cellToday}` : styles.cell}>
                <span className={styles.dayNum}>{d}</span>
                {g && opp && (
                  <button
                    type="button"
                    className={styles.gameChip}
                    onClick={() => played && g.result?.box && setModalGameId(g.id)}
                    disabled={!played}
                  >
                    <BkImage path={opp.logo} alt={opp.abbr} className={styles.gameLogo} />
                    <span className={styles.gameComp}>{g.comp ?? 'NBA'}</span>
                    <span className={styles.gameSide}>{home ? 'vs' : '@'} {opp.abbr}</span>
                    {played && (
                      <span className={won ? styles.gameWin : styles.gameLoss}>
                        {won ? 'W' : 'L'} {home ? g!.result!.home : g!.result!.away}-{home ? g!.result!.away : g!.result!.home}
                      </span>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Panel>
      {modalGame?.result?.box && <BoxScoreModal game={modalGame} onClose={() => setModalGameId(null)} />}
    </div>
  );
}

function BoxScoreModal({ game, onClose }: { game: Game; onClose: () => void }) {
  const s = useGameState();
  if (!s || !game.result?.box) return null;
  const { home, away } = game.result.box;
  const homeTeam = s.teams[game.home], awayTeam = s.teams[game.away];

  const table = (rows: typeof home, label: string) => {
    const sorted = [...rows].sort((a, b) => Number(b.starter) - Number(a.starter));
    return (
      <div className={styles.boxTeam}>
        <div className={styles.boxTeamName}>{label}</div>
        <table className={styles.boxTable}>
          <thead>
            <tr>
              <th>Player</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th><th>FG</th><th>3P</th><th>FT</th><th>+/-</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => {
              const p = s.players[b.id];
              return (
                <tr key={b.id} className={b.starter ? styles.starterRow : undefined}>
                  <td>{p ? `${p.firstName[0]}. ${p.lastName}` : b.id}</td>
                  <td>{b.min}</td><td>{b.pts}</td><td>{b.orb + b.drb}</td><td>{b.ast}</td>
                  <td>{b.stl}</td><td>{b.blk}</td><td>{b.tov}</td>
                  <td>{b.fgm}-{b.fga}</td><td>{b.tpm}-{b.tpa}</td><td>{b.ftm}-{b.fta}</td>
                  <td>{b.pm > 0 ? `+${b.pm}` : b.pm}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <span>{awayTeam.abbr} {game.result!.away} — {game.result!.home} {homeTeam.abbr}</span>
          <button type="button" onClick={onClose}>&#10005;</button>
        </div>
        <table className={styles.periodsTable}>
          <thead>
            <tr>
              <th></th>
              {game.result!.periods.map((_, i) => <th key={i}>{i < 4 ? `Q${i + 1}` : `OT${i - 3}`}</th>)}
              <th>Final</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{awayTeam.abbr}</td>
              {game.result!.periods.map((p, i) => <td key={i}>{p[1]}</td>)}
              <td>{game.result!.away}</td>
            </tr>
            <tr>
              <td>{homeTeam.abbr}</td>
              {game.result!.periods.map((p, i) => <td key={i}>{p[0]}</td>)}
              <td>{game.result!.home}</td>
            </tr>
          </tbody>
        </table>
        {table(away, `${awayTeam.city} ${awayTeam.name}`)}
        {table(home, `${homeTeam.city} ${homeTeam.name}`)}
      </div>
    </div>
  );
}
