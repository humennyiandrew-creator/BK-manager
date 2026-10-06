import { useEffect, useState, type CSSProperties } from 'react';
import { useUI } from '../store/useUI';
import { useGame } from '../store/useGame';
import BkImage from '../components/BkImage';
import Panel from '../components/Panel';
import { loadLeagueData } from '../loadData';
import { buildTeamPreviews, type TeamPreview } from '../teamPreview';
import { computeAccent } from '../accent';
import styles from './ChooseTeamScreen.module.css';

function Stars({ n }: { n: number }) {
  return (
    <span className={styles.stars}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < n ? styles.starOn : styles.starOff}>
          &#9733;
        </span>
      ))}
    </span>
  );
}

const TIER: Record<number, string> = { 5: 'Contender', 4: 'Playoff team', 3: 'In the mix', 2: 'Rebuilding', 1: 'Long rebuild' };

/** What ownership will ask for, by squad strength in its own league. */
function expectation(p: TeamPreview): string {
  const share = p.rank / Math.max(1, p.leagueSize);
  return share <= 0.14 ? 'Win the title' : share <= 0.34 ? 'Go deep in the playoffs' : share <= 0.6 ? 'Make the playoffs' : 'Develop the youth';
}

function TeamRow({ preview, selected, onSelect }: { preview: TeamPreview; selected: boolean; onSelect: () => void }) {
  const { team, stars } = preview;
  return (
    <button type="button" className={selected ? `${styles.team} ${styles.teamSelected}` : styles.team} onClick={onSelect}>
      <BkImage path={team.logo} alt={team.name} className={styles.logo} />
      <span className={styles.teamInfo}>
        <span className={styles.name}>{team.city} {team.name}</span>
        <Stars n={stars} />
      </span>
    </button>
  );
}

function ClubCard({ preview, selected, onSelect }: { preview: TeamPreview; selected: boolean; onSelect: () => void }) {
  const { team, stars } = preview;
  return (
    <button type="button" className={selected ? `${styles.club} ${styles.clubSelected}` : styles.club} onClick={onSelect}>
      <BkImage path={team.logo} alt={team.name} className={styles.clubLogo} />
      <span className={styles.clubName}>{team.name}</span>
      <span className={styles.clubCountry}>{team.country}</span>
      <Stars n={stars} />
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
        <div className={styles.loadingLayout}>
          <div className={`${styles.loadingPanel} shimmer`} />
          <div className={`${styles.loadingPanel} shimmer`} />
          <div className={`${styles.loadingPanel} shimmer`} />
        </div>
      </div>
    );
  }

  const nbaPreviews = previews.filter((p) => (p.team.league ?? 'NBA') === 'NBA');
  const elPreviews = previews.filter((p) => p.team.league === 'EL').sort((a, b) => a.team.name.localeCompare(b.team.name));
  const east = nbaPreviews.filter((p) => p.team.conference === 'East').sort((a, b) => a.team.name.localeCompare(b.team.name));
  const west = nbaPreviews.filter((p) => p.team.conference === 'West').sort((a, b) => a.team.name.localeCompare(b.team.name));
  const detail = previews.find((p) => p.team.id === selected) ?? null;
  const slot = pendingSlot ?? 1;
  const detailAccent = computeAccent(detail?.team.colors.primary, detail?.team.colors.secondary);
  const detailStyle = {
    '--accent': detailAccent.accent,
    '--accent-2': detailAccent.accent2,
    '--accent-contrast': detailAccent.accentContrast
  } as CSSProperties;

  const start = async () => {
    if (!detail || starting) return;
    setStarting(true);
    await startNew(detail.team.id, slot);
    setView('shell');
  };

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.back} onClick={() => setView('startMenu')}>
        &#8592; Back
      </button>
      <div className={styles.titleRow}>
        <div className={styles.title}><span className={styles.slash}>// </span>CHOOSE YOUR TEAM</div>
        {elPreviews.length > 0 && (
          <div className={styles.leagueSwitch}>
            {(['NBA', 'EL'] as const).map((lg) => (
              <button
                key={lg}
                type="button"
                className={lg === league ? `${styles.leagueBtn} ${styles.leagueBtnActive}` : styles.leagueBtn}
                onClick={() => { setLeague(lg); setSelected(null); }}
              >
                {lg === 'NBA' ? 'NBA' : 'EuroLeague'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={league === 'NBA' ? styles.layout : styles.layoutEl}>
        {league === 'NBA' ? (
          <>
            <Panel title="Eastern Conference" className={styles.confPanel} flush>
              <div className={styles.list}>
                {east.map((p) => (
                  <TeamRow key={p.team.id} preview={p} selected={p.team.id === selected} onSelect={() => setSelected(p.team.id)} />
                ))}
              </div>
            </Panel>
            <Panel title="Western Conference" className={styles.confPanel} flush>
              <div className={styles.list}>
                {west.map((p) => (
                  <TeamRow key={p.team.id} preview={p} selected={p.team.id === selected} onSelect={() => setSelected(p.team.id)} />
                ))}
              </div>
            </Panel>
          </>
        ) : (
          <Panel title="EuroLeague Clubs" className={styles.elPanel} flush>
            <div className={styles.elGrid}>
              {elPreviews.map((p) => (
                <ClubCard key={p.team.id} preview={p} selected={p.team.id === selected} onSelect={() => setSelected(p.team.id)} />
              ))}
            </div>
          </Panel>
        )}
        <div className={styles.detailPanel} style={detailStyle}>
          <Panel title="Team Detail" className={styles.detailPanelInner}>
            {!detail && <div className={styles.empty}>Select a team</div>}
            {detail && (
              <div className={styles.detail}>
                <div className={styles.hero} style={{ '--team': detail.team.colors.primary } as CSSProperties}>
                  <BkImage path={detail.team.logo} alt="" className={styles.heroWatermark} />
                  <BkImage path={detail.team.logo} alt={detail.team.name} className={styles.detailLogo} />
                  <div className={styles.heroText}>
                    <span className={styles.heroCity}>{detail.team.city}</span>
                    <span className={styles.heroName}>{detail.team.name}</span>
                    <span className={styles.heroTier}><Stars n={detail.stars} /> {TIER[detail.stars]}</span>
                  </div>
                </div>
                <div className={styles.facts}>
                  <div><span>Board expects</span><b>{expectation(detail)}</b></div>
                  <div><span>Squad strength</span><b className="mono-num">#{detail.rank} of {detail.leagueSize}</b></div>
                  <div><span>{detail.team.league === 'EL' ? 'Country' : 'Conference'}</span><b>{detail.team.league === 'EL' ? detail.team.country : `${detail.team.conference} · ${detail.team.division}`}</b></div>
                  <div><span>Arena</span><b className="mono-num">{detail.team.arenaCapacity.toLocaleString()} seats</b></div>
                </div>
                <div className={styles.keyHead}>Key players</div>
                <div className={styles.detailPlayers}>
                  {detail.topPlayers.map((p) => (
                    <div key={p.id} className={styles.detailPlayer}>
                      <BkImage path={p.face} alt={p.lastName} className={styles.keyFace} />
                      <span className={styles.keyPos}>{p.pos}</span>
                      <span className={styles.keyName}>{p.firstName} {p.lastName}</span>
                      <span className={styles.keyBar}><span style={{ width: `${Math.max(0, Math.min(100, (p.ovr - 55) * 2.3))}%` }} /></span>
                      <span className={`${styles.detailOvr} mono-num`}>{p.ovr}</span>
                    </div>
                  ))}
                </div>
                <button type="button" className={`${styles.startBtn} chevron-stripe`} onClick={start} disabled={starting}>
                  {starting ? 'Starting…' : 'Take the job'}
                </button>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
