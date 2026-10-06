import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useUI } from '../store/useUI';
import { useGame } from '../store/useGame';
import { deleteSave, listSaves } from '../saves';
import type { SaveMeta } from '../../types/bk';
import type { Team } from '../../engine/types';
import BkImage from '../components/BkImage';
import Preferences from '../components/Preferences';
import { formatDate } from '../format';
import { uniform } from '../components/shell/teamColors';
import styles from './StartMenuScreen.module.css';

type Mode = 'menu' | 'load' | 'newSlot' | 'settings';

const WHATS_NEW: { title: string; text: string }[] = [
  { title: 'Your club, your colours', text: 'The whole interface now wears your uniform, from the crest patch to the collar trim.' },
  { title: 'G League affiliates', text: 'Send young players down for minutes, call up the affiliate’s best, hand out two-way deals.' },
  { title: 'Longer careers', text: 'Five, ten, twenty seasons or open-ended, with free agency and the draft keeping every roster full.' },
  { title: 'Breakout and collapse seasons', text: 'Every year a few players come out of nowhere, or fall apart. Rare, and yours to handle.' },
  { title: 'Sponsor objectives', text: 'Partners set goals for every game. Hit them for cash and fan hype.' },
];

/** Title screen: an empty arena at night, your crest on centre court, and the menu. */
export default function StartMenuScreen() {
  const setView = useUI((s) => s.setView);
  const setPendingSlot = useUI((s) => s.setPendingSlot);
  const load = useGame((s) => s.load);
  const loadError = useGame((s) => s.loadError);
  const [mode, setMode] = useState<Mode>('menu');
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [confirmSlot, setConfirmSlot] = useState<number | null>(null);
  const [loadingSlot, setLoadingSlot] = useState<number | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);

  useEffect(() => { listSaves().then(setSaves).catch(() => setSaves([])); }, [mode]);
  useEffect(() => {
    Promise.all([
      import('@data/nba/teams.json').then((m) => m.default as Team[]),
      import('@data/el/teams.json').then((m) => m.default as Team[]).catch(() => [] as Team[]),
    ]).then(([a, b]) => setTeams([...a, ...b])).catch(() => setTeams([]));
  }, []);

  const latest = useMemo(() => [...saves].sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0], [saves]);
  const latestTeam = latest?.teamId ? teams.find((t) => t.id === latest.teamId) : undefined;
  const saveFor = (slot: number) => saves.find((s) => s.slot === slot);
  const metaLine = (sv: SaveMeta) => [sv.season, sv.record?.replace('-', '–'), formatDate(sv.date)].filter(Boolean).join(', ');

  const pickSlot = (slot: number) => {
    if (saveFor(slot)) { setConfirmSlot(slot); return; }
    setPendingSlot(slot);
    setView('chooseTeam');
  };
  const confirmOverwrite = () => {
    if (confirmSlot == null) return;
    setPendingSlot(confirmSlot);
    setConfirmSlot(null);
    setView('chooseTeam');
  };
  const doLoad = async (slot: number) => {
    setLoadingSlot(slot);
    const ok = await load(slot);
    setLoadingSlot(null);
    if (ok) setView('shell');
  };

  const items: { id: Mode | 'continue' | 'quit'; label: string; onClick: () => void; disabled?: boolean }[] = [
    { id: 'continue', label: 'Continue', onClick: () => latest && doLoad(latest.slot), disabled: !latest },
    { id: 'newSlot', label: 'New career', onClick: () => setMode('newSlot') },
    { id: 'load', label: 'Load career', onClick: () => setMode('load') },
    { id: 'settings', label: 'Settings', onClick: () => setMode('settings') },
    { id: 'quit', label: 'Quit', onClick: () => window.close() },
  ];

  const u = latestTeam ? uniform(latestTeam.colors.primary, latestTeam.colors.secondary) : latest?.color ? uniform(latest.color, '#eceae4') : null;
  const plate = u ? ({ '--team': u.team, '--team-2': u.trim, '--team-ink': u.ink } as CSSProperties) : undefined;

  return (
    <div className={styles.wrap} style={plate}>
      <div className={styles.arena} aria-hidden="true">
        <div className={styles.lights} />
        <div className={styles.floorWrap}>
          <div className={styles.floor}>
            <svg viewBox="0 0 94 50" className={styles.court} preserveAspectRatio="none">
              <rect x="0.3" y="0.3" width="93.4" height="49.4" />
              <line x1="47" y1="0" x2="47" y2="50" />
              <circle cx="47" cy="25" r="6" />
              {[false, true].map((flip) => (
                <g key={String(flip)} transform={flip ? 'translate(94 0) scale(-1 1)' : undefined}>
                  <rect x="0" y="17" width="19" height="16" className={styles.paint} />
                  <circle cx="19" cy="25" r="6" />
                  <path d="M0 3 H14 A23.75 23.75 0 0 1 14 47 H0" />
                  <circle cx="5.25" cy="25" r="0.75" />
                </g>
              ))}
            </svg>
            {(latestTeam?.logo ?? latest?.logo) && <BkImage path={(latestTeam?.logo ?? latest?.logo)!} alt="" className={styles.centreLogo} />}
          </div>
        </div>
      </div>

      <div className={styles.left}>
        <div className={styles.brand}>
          <div className={`${styles.logo} wordmark`}>BK <span>Manager</span></div>
          <div className={styles.tagline}>Basketball management for the NBA and EuroLeague</div>
        </div>
        <nav className={styles.menu}>
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              className={`${styles.item} ${mode === it.id ? styles.itemActive : ''}`}
              onClick={it.onClick}
              disabled={it.disabled || loadingSlot != null}
              data-sound-hover
              data-sound={it.id === 'continue' ? 'confirm' : undefined}
            >
              {it.id === 'continue' && loadingSlot != null ? 'Loading…' : it.label}
            </button>
          ))}
        </nav>
        {loadError && <div className={styles.error}>{loadError}</div>}
        <div className={styles.build}>Alpha build</div>
      </div>

      <div className={styles.right}>
        {mode === 'menu' && (
          <>
            {latest ? (
              <button type="button" className={styles.plate} onClick={() => doLoad(latest.slot)} disabled={loadingSlot != null} data-sound="confirm">
                <span className={styles.plateBand}>
                  <span className={styles.platePatch}>{latest.logo ? <BkImage path={latest.logo} alt={latest.teamName} className={styles.plateCrest} /> : null}</span>
                  <span className={styles.plateText}>
                    <span className={styles.plateKicker}>Continue career</span>
                    <span className={`${styles.plateTeam} wordmark`}>{latestTeam?.name ?? latest.teamName}</span>
                  </span>
                </span>
                <span className={styles.plateTrim} />
                <span className={styles.plateFoot}>
                  <span className={styles.plateMeta}>{metaLine(latest)}</span>
                  <span className={styles.plateGo}>{loadingSlot === latest.slot ? 'Loading…' : 'Resume'}</span>
                </span>
              </button>
            ) : (
              <button type="button" className={styles.plate} onClick={() => setMode('newSlot')}>
                <span className={styles.plateBand}>
                  <span className={styles.plateText}>
                    <span className={styles.plateKicker}>Start your career</span>
                    <span className={`${styles.plateTeam} wordmark`}>Take the job</span>
                  </span>
                </span>
                <span className={styles.plateTrim} />
                <span className={styles.plateFoot}>
                  <span className={styles.plateMeta}>Fifty clubs in two leagues</span>
                  <span className={styles.plateGo}>New career</span>
                </span>
              </button>
            )}
            <div className={styles.news}>
              <span className={styles.newsHead}>New in this build</span>
              {WHATS_NEW.map((n) => (
                <div key={n.title} className={styles.newsItem}>
                  <span className={styles.newsTitle}>{n.title}</span>
                  <span className={styles.newsText}>{n.text}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {mode === 'newSlot' && (
          <div className={styles.drawer}>
            <span className={styles.drawerHead}>New career: choose a save slot</span>
            {[1, 2, 3, 4, 5].map((slot) => {
              const save = saveFor(slot);
              return (
                <div key={slot} className={styles.slot}>
                  <span className={`${styles.slotNum} numeral`}>{slot}</span>
                  <div className={styles.slotText}>
                    <span className={styles.slotTeam}>{save ? save.teamName : 'Empty slot'}</span>
                    {save && <span className={styles.slotMeta}>{metaLine(save)}</span>}
                  </div>
                  {confirmSlot === slot ? (
                    <div className={styles.slotActions}>
                      <span className={styles.slotMeta}>Overwrite?</span>
                      <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={confirmOverwrite}>Yes</button>
                      <button type="button" className={styles.btn} onClick={() => setConfirmSlot(null)}>No</button>
                    </div>
                  ) : (
                    <button type="button" className={save ? styles.btn : `${styles.btn} ${styles.btnPrimary}`} onClick={() => pickSlot(slot)}>{save ? 'Overwrite' : 'Select'}</button>
                  )}
                </div>
              );
            })}
            <button type="button" className={styles.back} onClick={() => setMode('menu')}>Back</button>
          </div>
        )}

        {mode === 'load' && (
          <div className={styles.drawer}>
            <span className={styles.drawerHead}>Load career</span>
            {saves.length === 0 && <div className={styles.empty}>No saved careers yet.</div>}
            {saves.map((sv) => (
              <div key={sv.slot} className={styles.slot}>
                {sv.logo ? <BkImage path={sv.logo} alt={sv.teamName} className={styles.slotLogo} /> : <span className={`${styles.slotNum} numeral`}>{sv.slot}</span>}
                <div className={styles.slotText}>
                  <span className={styles.slotTeam}>{sv.teamName}</span>
                  <span className={styles.slotMeta}>Slot {sv.slot}, {metaLine(sv)}</span>
                </div>
                <div className={styles.slotActions}>
                  <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => doLoad(sv.slot)} disabled={loadingSlot != null}>{loadingSlot === sv.slot ? 'Loading…' : 'Load'}</button>
                  <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => deleteSave(sv.slot).then(() => listSaves()).then(setSaves)}>Delete</button>
                </div>
              </div>
            ))}
            <button type="button" className={styles.back} onClick={() => setMode('menu')}>Back</button>
          </div>
        )}

        {mode === 'settings' && (
          <div className={`${styles.drawer} ${styles.prefs}`}>
            <span className={styles.drawerHead}>Settings</span>
            <Preferences />
            <button type="button" className={styles.back} onClick={() => setMode('menu')}>Back</button>
          </div>
        )}
      </div>
    </div>
  );
}
