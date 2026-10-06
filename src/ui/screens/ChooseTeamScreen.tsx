import { useEffect, useState, type CSSProperties } from 'react';
import { useUI } from '../store/useUI';
import { useGame } from '../store/useGame';
import BkImage from '../components/BkImage';
import { loadLeagueData } from '../loadData';
import { buildTeamPreviews, type TeamPreview } from '../teamPreview';
import { computeAccent } from '../accent';
import { uniform } from '../components/shell/teamColors';
import styles from './ChooseTeamScreen.module.css';

/** Squad strength as five short bars rather than stars. */
function Strength({ n }: { n: number }) {
  return (
    <span className={styles.strength} title={`${n} of 5`}>
      {Array.from({ length: 5 }, (_, i) => <i key={i} className={i < n ? styles.barOn : undefined} />)}
    </span>
  );
}

const CAREER_LENGTHS = [{ n: 5, label: '5 seasons' }, { n: 10, label: '10 seasons' }, { n: 20, label: '20 seasons' }, { n: 0, label: 'Open-ended' }];

const TIER: Record<number, string> = { 5: 'Contender', 4: 'Playoff team', 3: 'In the mix', 2: 'Rebuilding', 1: 'Long rebuild' };

/** What ownership will ask for, by squad strength in its own league. */
function expectation(p: TeamPreview): string {
  const share = p.rank / Math.max(1, p.leagueSize);
  return share <= 0.14 ? 'Win the title' : share <= 0.34 ? 'Go deep in the playoffs' : share <= 0.6 ? 'Make the playoffs' : 'Develop the youth';
}

/** One crest patch on the wall. */
function Patch({ preview, selected, onSelect }: { preview: TeamPreview; selected: boolean; onSelect: () => void }) {
  const { team, stars } = preview;
  const u = uniform(team.colors.primary, team.colors.secondary);
  return (
    <button
      type="button"
      className={selected ? `${styles.patchBtn} ${styles.patchOn}` : styles.patchBtn}
      style={{ '--team': u.team, '--team-2': u.trim } as CSSProperties}
      onClick={onSelect}
      data-sound-hover
    >
      <span className={styles.patch}><BkImage path={team.logo} alt={team.name} className={styles.patchCrest} /></span>
      <span className={styles.patchName}>{team.name}</span>
      <Strength n={stars} />
    </button>
  );
}

export default function ChooseTeamScreen() {
  const setView = useUI((s) => s.setView);
  const pendingSlot = useUI((s) => s.pendingSlot);
  const startNew = useGame((s) => s.startNew);
  const [previews, setPreviews] = useState<TeamPreview[] | null>(null);
  const [league, setLeague] = useState<'NBA' | 'EL'>('NBA');
  const [selected, setSelected] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [seasons, setSeasons] = useState(10);

  useEffect(() => {
    let cancelled = false;
    loadLeagueData().then(({ teams, players }) => {
      if (cancelled) return;
      setPreviews(buildTeamPreviews(teams, players));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!previews) {
    return (
      <div className={styles.wrap}>
        <div className={styles.loading}>Loading the league…</div>
      </div>
    );
  }

  const byName = (a: TeamPreview, b: TeamPreview) => a.team.name.localeCompare(b.team.name);
  const nbaPreviews = previews.filter((p) => (p.team.league ?? 'NBA') === 'NBA');
  const groups = league === 'NBA'
    ? [
      { title: 'Eastern Conference', list: nbaPreviews.filter((p) => p.team.conference === 'East').sort(byName) },
      { title: 'Western Conference', list: nbaPreviews.filter((p) => p.team.conference === 'West').sort(byName) },
    ]
    : [{ title: 'EuroLeague', list: previews.filter((p) => p.team.league === 'EL').sort(byName) }];
  const hasEl = previews.some((p) => p.team.league === 'EL');
  const detail = previews.find((p) => p.team.id === selected) ?? null;
  const slot = pendingSlot ?? 1;
  const u = detail ? uniform(detail.team.colors.primary, detail.team.colors.secondary) : null;
  const accent = computeAccent(detail?.team.colors.primary, detail?.team.colors.secondary);
  const detailStyle = (u ? { '--team': u.team, '--team-2': u.trim, '--team-ink': u.ink, '--accent': accent.accent } : {}) as CSSProperties;

  const start = async () => {
    if (!detail || starting) return;
    setStarting(true);
    await startNew(detail.team.id, slot, seasons);
    setView('shell');
  };

  return (
    <div className={styles.wrap}>
      <header className={styles.top}>
        <button type="button" className={styles.back} onClick={() => setView('startMenu')}>Back</button>
        <h1 className={`${styles.title} wordmark`}>Choose your club</h1>
        {hasEl && (
          <div className={styles.leagueSwitch}>
            {(['NBA', 'EL'] as const).map((lg) => (
              <button
                key={lg}
                type="button"
                className={lg === league ? `${styles.leagueBtn} ${styles.leagueOn}` : styles.leagueBtn}
                onClick={() => { setLeague(lg); setSelected(null); }}
              >
                {lg === 'NBA' ? 'NBA' : 'EuroLeague'}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className={styles.layout}>
        <div className={styles.wall}>
          {groups.map((g) => (
            <section key={g.title} className={styles.group}>
              <h2 className={styles.groupTitle}>{g.title}</h2>
              <div className={styles.patches}>
                {g.list.map((p) => <Patch key={p.team.id} preview={p} selected={p.team.id === selected} onSelect={() => setSelected(p.team.id)} />)}
              </div>
            </section>
          ))}
        </div>

        <aside className={styles.preview} style={detailStyle}>
          <div className={styles.pBand}>
            <span className={styles.pPatch}>{detail && <BkImage path={detail.team.logo} alt={detail.team.name} className={styles.pCrest} />}</span>
            <span className={styles.pText}>
              <span className={styles.pCity}>{detail ? detail.team.city || detail.team.country : 'No club selected'}</span>
              <span className={`${styles.pName} wordmark`}>{detail ? detail.team.name : 'Pick a crest'}</span>
            </span>
          </div>
          <div className={styles.pTrim} />
          {detail ? (
            <div className={styles.pBody}>
              <div className={styles.pTier}><Strength n={detail.stars} /> {TIER[detail.stars]}</div>
              <dl className={styles.facts}>
                <div><dt>Board expects</dt><dd>{expectation(detail)}</dd></div>
                <div><dt>Squad strength</dt><dd>{detail.rank} of {detail.leagueSize}</dd></div>
                <div><dt>{detail.team.league === 'EL' ? 'Country' : 'Conference'}</dt><dd>{detail.team.league === 'EL' ? detail.team.country : `${detail.team.conference}, ${detail.team.division}`}</dd></div>
                <div><dt>Arena</dt><dd>{detail.team.arenaCapacity.toLocaleString()} seats</dd></div>
              </dl>
              <div className={styles.sub}>Key players</div>
              <div className={styles.players}>
                {detail.topPlayers.map((p) => (
                  <div key={p.id} className={styles.player}>
                    <BkImage path={p.face} alt={p.lastName} className={styles.face} />
                    <span className={styles.pWho}>
                      <span className={styles.pPlayer}>{p.firstName} {p.lastName}</span>
                      <span className={styles.pPos}>{p.pos}</span>
                    </span>
                    <span className={`${styles.pOvr} numeral`}>{p.ovr}</span>
                  </div>
                ))}
              </div>
              <div className={styles.sub}>Career length</div>
              <div className={styles.lengthRow}>
                {CAREER_LENGTHS.map((c) => (
                  <button key={c.n} type="button" className={c.n === seasons ? `${styles.lengthBtn} ${styles.lengthOn}` : styles.lengthBtn} onClick={() => setSeasons(c.n)}>{c.label}</button>
                ))}
              </div>
              <button type="button" className={styles.startBtn} onClick={start} disabled={starting} data-sound="confirm">
                {starting ? 'Starting…' : 'Take the job'}
              </button>
            </div>
          ) : (
            <div className={styles.pEmpty}>Every club on the wall is hiring. Pick one to see the squad, the arena and what the board expects.</div>
          )}
        </aside>
      </div>
    </div>
  );
}
