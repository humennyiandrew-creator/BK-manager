import HeroHeader from '../components/HeroHeader';
import Panel from '../components/Panel';
import BkImage from '../components/BkImage';
import RingGauge from '../components/hub/RingGauge';
import ArcBadge from '../components/hub/ArcBadge';
import { toast } from '../components/Toasts';
import { useGame, useGameState } from '../store/useGame';
import { useUI } from '../store/useUI';
import { formatMoneyShort } from '../format';
import {
  ACTIVITIES, activityReadyIn, chemistryReport, leadership, lockerRoom, runActivity, setCaptain
} from '../../engine/chemistry';
import type { Player } from '../../engine/model';
import styles from './LockerRoomScreen.module.css';

const trait = (v: number, hi: string, lo: string) => (v >= 16 ? hi : v <= 5 ? lo : null);

/** Locker room: chemistry breakdown, the captaincy, team activities and the mood of every player. */
export default function LockerRoomScreen() {
  const s = useGameState();
  const mutate = useGame((g) => g.mutate);
  const openPlayer = useUI((u) => u.openPlayer);
  if (!s) return null;
  const rep = chemistryReport(s, s.userTeamId);
  const lr = lockerRoom(s);
  const captain = lr.captain && s.players[lr.captain]?.teamId === s.userTeamId ? s.players[lr.captain] : undefined;
  const roster = Object.values(s.players).filter((p) => p.teamId === s.userTeamId && !p.retired);
  const candidates = [...roster].sort((a, b) => leadership(b) - leadership(a)).slice(0, 6);
  const byMood = [...roster].sort((a, b) => a.morale - b.morale);

  const run = (id: (typeof ACTIVITIES)[number]['id']) => {
    let res = { ok: false, text: '' };
    mutate((st) => { res = runActivity(st, id); });
    toast(res.text, res.ok ? 'success' : 'error');
  };
  const appoint = (p: Player) => {
    let err: string | null = null;
    mutate((st) => { err = setCaptain(st, p.id); });
    toast(err ?? `${p.firstName} ${p.lastName} is the new captain`, err ? 'error' : 'success');
  };

  return (
    <div className={styles.screen}>
      <HeroHeader title="Locker room" subtitle="Chemistry, leadership and team activities" />
      <div className={styles.grid}>
        <div className={styles.col}>
          <Panel title="Team chemistry">
            <div className={styles.chemTop}>
              <RingGauge value={rep.score} label="Chemistry" sub={rep.mood} size={7.5} color={rep.score < 40 ? 'var(--negative)' : rep.score >= 65 ? 'var(--positive)' : 'var(--accent)'} />
              <div className={styles.parts}>
                {rep.parts.map((p) => (
                  <div key={p.label} className={styles.part}>
                    <span className={styles.partLabel}>{p.label}</span>
                    <span className={styles.partTrack}>
                      <span className={styles.partFill} style={{ left: p.value >= 0 ? '50%' : `${50 - Math.min(50, Math.abs(p.value) * 3)}%`, width: `${Math.min(50, Math.abs(p.value) * 3)}%`, background: p.value >= 0 ? 'var(--positive)' : 'var(--negative)' }} />
                    </span>
                    <span className={`${styles.partValue} mono-num ${p.value >= 0 ? styles.pos : styles.neg}`}>{p.value > 0 ? '+' : ''}{p.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className={styles.note}>Chemistry gives a small on-court edge (up to about ±1% on every shot). It's rebuilt every Monday from morale, continuity, egos, leadership, recent results and team bonding.</p>
          </Panel>
          <Panel title="Team activities">
            <div className={styles.activities}>
              {ACTIVITIES.map((a) => {
                const wait = activityReadyIn(s, a.id);
                return (
                  <div key={a.id} className={styles.activity}>
                    <div className={styles.actText}>
                      <span className={styles.actName}>{a.label}</span>
                      <span className={styles.actDesc}>{a.desc}</span>
                    </div>
                    <div className={styles.actSide}>
                      <span className={`${styles.actCost} mono-num`}>{a.cost ? formatMoneyShort(a.cost) : 'Free'}</span>
                      <button type="button" className={styles.actBtn} disabled={wait > 0} onClick={() => run(a.id)} data-sound="confirm">
                        {wait > 0 ? `${wait}d` : 'Run'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>

        <div className={styles.col}>
          <Panel title="Captain">
            {captain ? (
              <div className={styles.captain}>
                <BkImage path={captain.face} alt={captain.lastName} className={styles.capFace} />
                <div className={styles.capInfo}>
                  <span className={styles.capBadge}>C</span>
                  <span className={styles.capName}>{captain.firstName} {captain.lastName}</span>
                  <span className={styles.capMeta}>Leadership {Math.round(leadership(captain) * 100)}, {captain.yearsPro} yrs pro, morale {captain.morale}</span>
                </div>
              </div>
            ) : <div className={styles.noCap}>No captain named. The room is missing a voice — pick a leader below.</div>}
            <div className={styles.candHead}>Natural leaders</div>
            {candidates.map((p) => (
              <div key={p.id} className={styles.cand}>
                <BkImage path={p.face} alt={p.lastName} className={styles.candFace} />
                <button type="button" className={styles.candName} onClick={() => openPlayer(p.id)}>{p.firstName[0]}. {p.lastName}</button>
                <span className={styles.leadBar}><span style={{ width: `${Math.round(leadership(p) * 100)}%` }} /></span>
                <span className={`${styles.leadNum} mono-num`}>{Math.round(leadership(p) * 100)}</span>
                <button type="button" className={styles.smallBtn} disabled={p.id === captain?.id} onClick={() => appoint(p)}>{p.id === captain?.id ? 'Captain' : 'Appoint'}</button>
              </div>
            ))}
            <p className={styles.note}>A good captain lifts the chemistry and picks up unhappy teammates each week. Replacing one stings the old captain; a big-ego captain rubs other big egos the wrong way.</p>
          </Panel>
        </div>

        <div className={styles.col}>
          <Panel title="Mood board" className={styles.mood}>
            {byMood.map((p) => {
              const tags = [
                trait(p.ratings.personality.ego, 'Big ego', 'Humble'),
                trait(p.ratings.personality.temperament, 'Cool head', 'Hot head'),
                trait(p.ratings.personality.workEthic, 'Gym rat', 'Coasting'),
                trait(p.ratings.personality.loyalty, 'Loyal', 'Mercenary'),
              ].filter(Boolean);
              return (
                <button key={p.id} type="button" className={styles.moodRow} onClick={() => openPlayer(p.id)}>
                  <BkImage path={p.face} alt={p.lastName} className={styles.candFace} />
                  <span className={styles.moodWho}>
                    <span className={styles.moodName}>{p.firstName[0]}. {p.lastName} {captain?.id === p.id && <span className={styles.capMini}>C</span>}</span>
                    <span className={styles.tags}>
                      <ArcBadge arc={p.arc} season={s.season} />
                      {tags.map((t) => <span key={t} className={styles.tag}>{t}</span>)}
                    </span>
                  </span>
                  <span className={styles.moodBar}><span style={{ width: `${p.morale}%`, background: p.morale >= 65 ? 'var(--positive)' : p.morale >= 40 ? '#e3a32e' : 'var(--negative)' }} /></span>
                  <span className={`${styles.moodNum} mono-num`}>{p.morale}</span>
                </button>
              );
            })}
          </Panel>
        </div>
      </div>
    </div>
  );
}
