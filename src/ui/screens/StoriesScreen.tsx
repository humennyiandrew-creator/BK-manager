import HeroHeader from '../components/HeroHeader';
import Panel from '../components/Panel';
import BkImage from '../components/BkImage';
import { useGameState } from '../store/useGame';
import { useUI } from '../store/useUI';
import { formatDate } from '../format';
import { TIER_LABEL, tierOf } from '../../engine/rivalries';
import { STORY_LABEL } from '../../engine/storylines';
import type { GameState, RivalTier, Storyline } from '../../engine/model';
import styles from './StoriesScreen.module.css';

const STAKES: Record<RivalTier, string> = {
  regular: 'Wins lift hype and board confidence a little.',
  heated: 'Wins count double with the fans and the board, and add to your reputation. Losses sting.',
  defining: 'The games people will remember: triple stakes, and partners pay more on rivalry nights.',
};

/** Heat from 0 to 100 with the tier thresholds marked. */
function Heat({ heat }: { heat: number }) {
  const tier = tierOf(heat);
  return (
    <span className={styles.heat} title={`Heat ${Math.round(heat)}`}>
      <span className={`${styles.heatFill} ${styles[tier]}`} style={{ width: `${Math.min(100, heat)}%` }} />
      <i style={{ left: '40%' }} /><i style={{ left: '75%' }} />
    </span>
  );
}

function ClubRivals({ s }: { s: GameState }) {
  const list = s.rivals?.clubs ?? [];
  if (!list.length) return <p className={styles.note}>Rivals take shape over a season: division neighbours, conference contenders, and whoever knocks you out.</p>;
  return (
    <div className={styles.clubs}>
      {list.map((c) => {
        const t = s.teams[c.teamId];
        const tier = tierOf(c.heat);
        return (
          <div key={c.teamId} className={styles.club}>
            <div className={styles.clubTop}>
              <span className={styles.patch}><BkImage path={t.logo} alt={t.abbr} className={styles.crest} /></span>
              <span className={styles.clubText}>
                <span className={styles.tier}>{TIER_LABEL[tier]}</span>
                <span className={`${styles.clubName} wordmark`}>{t.name}</span>
                <span className={styles.reason}>{c.reason}, since {c.since}</span>
              </span>
            </div>
            <Heat heat={c.heat} />
            <div className={styles.records}>
              <span><b className="numeral">{c.season.w}–{c.season.l}</b> this season</span>
              <span><b className="numeral">{c.allTime.w}–{c.allTime.l}</b> all time</span>
            </div>
            <p className={styles.stakes}>{STAKES[tier]}</p>
          </div>
        );
      })}
    </div>
  );
}

function PlayerRivals({ s }: { s: GameState }) {
  const openPlayer = useUI((u) => u.openPlayer);
  const list = (s.rivals?.players ?? []).filter((r) => s.players[r.playerId] && s.players[r.rivalId]);
  if (!list.length) return <p className={styles.note}>Your best players pick up a rival at their position once they are established starters.</p>;
  return (
    <div className={styles.duels}>
      {list.map((r) => {
        const a = s.players[r.playerId], b = s.players[r.rivalId];
        const bt = b.teamId ? s.teams[b.teamId] : null;
        return (
          <div key={r.playerId} className={styles.duel}>
            <div className={styles.duelTop}>
              <button type="button" className={styles.duelSide} onClick={() => openPlayer(a.id)}>
                <BkImage path={a.face} alt={a.lastName} className={styles.face} />
                <span className={styles.duelName}>{a.lastName}</span>
              </button>
              <span className={`${styles.duelScore} numeral`}>{r.season.w}–{r.season.l}</span>
              <button type="button" className={`${styles.duelSide} ${styles.duelRight}`} onClick={() => openPlayer(b.id)}>
                <span className={styles.duelName}>{b.lastName}{bt ? <span className={styles.duelTeam}>{bt.abbr}</span> : null}</span>
                <BkImage path={b.face} alt={b.lastName} className={styles.face} />
              </button>
            </div>
            <Heat heat={r.heat} />
            <div className={styles.records}>
              <span>{TIER_LABEL[tierOf(r.heat)]}</span>
              <span>{r.reason}</span>
              <span>{r.allTime.w}–{r.allTime.l} all time</span>
            </div>
          </div>
        );
      })}
      <p className={styles.note}>A duel goes to whoever has the better game when they meet. Winning them lifts morale and form; win a heated duel over a season and he comes back sharper.</p>
    </div>
  );
}

function Story({ s, st }: { s: GameState; st: Storyline }) {
  const openPlayer = useUI((u) => u.openPlayer);
  const p = s.players[st.playerId];
  const last = st.log[st.log.length - 1];
  return (
    <div className={`${styles.story} ${st.done ? styles[`out_${st.outcome ?? 'neutral'}`] : ''}`}>
      <div className={styles.storyHead}>
        {p && <BkImage path={p.face} alt={p.lastName} className={styles.face} />}
        <span className={styles.storyText}>
          <span className={styles.storyKind}>{STORY_LABEL[st.kind]}</span>
          {p && <button type="button" className={styles.storyName} onClick={() => openPlayer(p.id)}>{p.firstName} {p.lastName}</button>}
        </span>
        <span className={styles.storyState}>{st.done ? (st.outcome === 'good' ? 'Happy ending' : st.outcome === 'bad' ? 'Went wrong' : 'Closed') : st.awaiting ? 'Decision due' : 'Ongoing'}</span>
      </div>
      <ol className={styles.log}>
        {st.log.map((l, i) => <li key={i} className={l === last ? styles.logLast : undefined}><span>{formatDate(l.date).replace(/, \d{4}$/, '')}</span>{l.text}</li>)}
      </ol>
    </div>
  );
}

/** Rivalries (club and player) and the multi-step stories around our players. */
export default function StoriesScreen() {
  const s = useGameState();
  if (!s) return null;
  const all = (s.stories ?? []).filter((x) => x.season === s.season);
  const open = all.filter((x) => !x.done), closed = all.filter((x) => x.done);
  return (
    <div className={styles.screen}>
      <HeroHeader title="Rivalries and stories" subtitle="Rivals, duels and the stories around your players"
        right={<span className={styles.acclaim}><span className="numeral">{Math.round(s.rivals?.acclaim ?? 0)}</span> acclaim from rivalry wins</span>} />
      <div className={styles.grid}>
        <Panel title="Club rivalries"><ClubRivals s={s} /></Panel>
        <Panel title="Player duels"><PlayerRivals s={s} /></Panel>
        <Panel title="Stories this season">
          {!all.length && <p className={styles.note}>Stories find you: a contract year, an unhappy star, a comeback from injury, a veteran taking a rookie under his wing, the rookie wall.</p>}
          {open.map((st) => <Story key={st.id} s={s} st={st} />)}
          {closed.map((st) => <Story key={st.id} s={s} st={st} />)}
        </Panel>
      </div>
    </div>
  );
}
