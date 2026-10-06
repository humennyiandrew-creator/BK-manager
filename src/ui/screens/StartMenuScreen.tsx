import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useUI } from '../store/useUI';
import { useGame } from '../store/useGame';
import { deleteSave, listSaves } from '../saves';
import type { SaveMeta } from '../../types/bk';
import type { Team } from '../../engine/types';
import BkImage from '../components/BkImage';
import Preferences from '../components/Preferences';
import { formatDate } from '../format';
import styles from './StartMenuScreen.module.css';

type Mode = 'menu' | 'load' | 'newSlot' | 'settings';

const WHATS_NEW: { tag: string; title: string; text: string }[] = [
  { tag: 'Players', title: 'Breakout & collapse seasons', text: 'Every year a handful of players come out of nowhere — or fall apart. Rare, unpredictable, and you decide how to handle it.' },
  { tag: 'Matchday', title: 'Sponsor objectives', text: 'Partners set goals for every game: threes, rebounds, a big night from your star. Hit them for cash and fan hype.' },
  { tag: 'Club', title: 'Locker room', text: 'Team chemistry, a captain, and activities from team dinners to retreats. A happy room plays better.' },
  { tag: 'League', title: 'League hub', text: 'Weekly power rankings, award races, player of the week and a live news wire from around the league.' },
  { tag: 'Live', title: 'Coach on the sideline', text: 'Push or conserve energy, timeout team talks, momentum, win probability and a live shot chart.' },
];

/** Title screen: F1 Manager-style full-bleed menu with a continue card, what's new, and a team logo marquee. */
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
  const saveFor = (slot: number) => saves.find((s) => s.slot === slot);

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

  const items: { id: string; label: string; sub: string; onClick: () => void; disabled?: boolean; active?: boolean }[] = [
    { id: 'continue', label: 'Continue', sub: latest ? `${latest.teamName} · ${formatDate(latest.date)}` : 'No career in progress', onClick: () => latest && doLoad(latest.slot), disabled: !latest },
    { id: 'new', label: 'New Career', sub: 'NBA or EuroLeague — pick your club', onClick: () => setMode('newSlot'), active: mode === 'newSlot' },
    { id: 'load', label: 'Load Career', sub: `${saves.length} saved career${saves.length === 1 ? '' : 's'}`, onClick: () => setMode('load'), active: mode === 'load' },
    { id: 'settings', label: 'Settings', sub: 'Audio and display', onClick: () => setMode('settings'), active: mode === 'settings' },
    { id: 'quit', label: 'Quit', sub: 'Back to the desktop', onClick: () => window.close() },
  ];

  const marquee = teams.length ? [...teams, ...teams] : [];

  return (
    <div className={styles.wrap} style={{ '--card-color': latest?.color ?? 'var(--accent)' } as CSSProperties}>
      <div className={styles.bg} aria-hidden="true">
        <div className={styles.spot} />
        <div className={styles.floor}>
          <svg viewBox="0 0 94 50" className={styles.court} preserveAspectRatio="none">
            <rect x="0.3" y="0.3" width="93.4" height="49.4" />
            <line x1="47" y1="0" x2="47" y2="50" />
            <circle cx="47" cy="25" r="6" />
            <circle cx="47" cy="25" r="2" />
            {[false, true].map((flip) => (
              <g key={String(flip)} transform={flip ? 'translate(94 0) scale(-1 1)' : undefined}>
                <rect x="0" y="17" width="19" height="16" />
                <circle cx="19" cy="25" r="6" />
                <path d="M0 3 H14 A23.75 23.75 0 0 1 14 47 H0" />
                <circle cx="5.25" cy="25" r="0.75" />
              </g>
            ))}
          </svg>
        </div>
        <div className={styles.streaks}><span /><span /><span /></div>
        <div className={styles.watermark}>BK</div>
      </div>

      <div className={styles.left}>
        <div className={styles.brand}>
          <div className={styles.logo}><span className={styles.slash}>//</span> BK <span className={styles.accent}>MANAGER</span></div>
          <div className={styles.tagline}>Basketball management · NBA &amp; EuroLeague</div>
        </div>
        <nav className={`${styles.menu} stagger`}>
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              className={`${styles.item} ${it.active ? styles.itemActive : ''}`}
              onClick={it.onClick}
              disabled={it.disabled || loadingSlot != null}
              data-sound-hover
              data-sound={it.id === 'continue' ? 'confirm' : undefined}
            >
              <span className={`${styles.idx} mono-num`}>{String(i + 1).padStart(2, '0')}</span>
              <span className={styles.itemText}>
                <span className={styles.itemLabel}>{it.id === 'continue' && loadingSlot != null ? 'Loading…' : it.label}</span>
                <span className={styles.itemSub}>{it.sub}</span>
              </span>
              <span className={styles.itemArrow}>›</span>
            </button>
          ))}
        </nav>
        {loadError && <div className={styles.error}>{loadError}</div>}
      </div>

      <div className={styles.right}>
        {mode === 'menu' && (
          <>
            {latest ? (
              <button type="button" className={`${styles.card} ${styles.continueCard}`} onClick={() => doLoad(latest.slot)} disabled={loadingSlot != null} data-sound="confirm">
                <span className={styles.cardKicker}>Continue career</span>
                <div className={styles.contBody}>
                  {latest.logo ? <BkImage path={latest.logo} alt={latest.teamName} className={styles.contLogo} /> : <div className={styles.contLogo} />}
                  <div className={styles.contText}>
                    <span className={styles.contTeam}>{latest.teamName}</span>
                    <span className={styles.contMeta}>
                      {latest.season && <span>{latest.season}</span>}
                      {latest.record && <span className="mono-num">{latest.record}</span>}
                      <span>{formatDate(latest.date)}</span>
                    </span>
                  </div>
                </div>
                <span className={styles.contGo}>{loadingSlot === latest.slot ? 'Loading…' : 'Resume ▶'}</span>
              </button>
            ) : (
              <button type="button" className={`${styles.card} ${styles.continueCard}`} onClick={() => setMode('newSlot')}>
                <span className={styles.cardKicker}>Start your career</span>
                <div className={styles.contText}>
                  <span className={styles.contTeam}>Take the job</span>
                  <span className={styles.contMeta}><span>50 clubs · two leagues · five seasons to build a legacy</span></span>
                </div>
                <span className={styles.contGo}>New career ▶</span>
              </button>
            )}
            <div className={styles.card}>
              <span className={styles.cardKicker}>What's new</span>
              <div className={styles.news}>
                {WHATS_NEW.map((n) => (
                  <div key={n.title} className={styles.newsItem}>
                    <span className={styles.newsTag}>{n.tag}</span>
                    <span className={styles.newsTitle}>{n.title}</span>
                    <span className={styles.newsText}>{n.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {mode === 'newSlot' && (
          <div className={`${styles.card} ${styles.drawer} slide-in-right`}>
            <span className={styles.cardKicker}>New career — choose a save slot</span>
            {[1, 2, 3, 4, 5].map((slot) => {
              const save = saveFor(slot);
              return (
                <div key={slot} className={styles.slot}>
                  <span className={`${styles.slotNum} mono-num`}>{slot}</span>
                  <div className={styles.slotText}>
                    <span className={styles.slotTeam}>{save ? save.teamName : 'Empty slot'}</span>
                    {save && <span className={styles.slotMeta}>{save.season ? `${save.season} · ` : ''}{save.record ? `${save.record} · ` : ''}{formatDate(save.date)}</span>}
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
            <button type="button" className={styles.back} onClick={() => setMode('menu')}>‹ Back</button>
          </div>
        )}

        {mode === 'load' && (
          <div className={`${styles.card} ${styles.drawer} slide-in-right`}>
            <span className={styles.cardKicker}>Load career</span>
            {saves.length === 0 && <div className={styles.empty}>No saved careers yet.</div>}
            {saves.map((sv) => (
              <div key={sv.slot} className={styles.slot}>
                {sv.logo ? <BkImage path={sv.logo} alt={sv.teamName} className={styles.slotLogo} /> : <span className={`${styles.slotNum} mono-num`}>{sv.slot}</span>}
                <div className={styles.slotText}>
                  <span className={styles.slotTeam}>{sv.teamName}</span>
                  <span className={styles.slotMeta}>Slot {sv.slot} · {sv.season ? `${sv.season} · ` : ''}{sv.record ? `${sv.record} · ` : ''}{formatDate(sv.date)}</span>
                </div>
                <div className={styles.slotActions}>
                  <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => doLoad(sv.slot)} disabled={loadingSlot != null}>{loadingSlot === sv.slot ? 'Loading…' : 'Load'}</button>
                  <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => deleteSave(sv.slot).then(() => listSaves()).then(setSaves)}>Delete</button>
                </div>
              </div>
            ))}
            <button type="button" className={styles.back} onClick={() => setMode('menu')}>‹ Back</button>
          </div>
        )}

        {mode === 'settings' && (
          <div className={`${styles.card} ${styles.drawer} ${styles.prefs} slide-in-right`}>
            <span className={styles.cardKicker}>Settings</span>
            <Preferences />
            <button type="button" className={styles.back} onClick={() => setMode('menu')}>‹ Back</button>
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <div className={styles.marquee}>
          <div className={styles.marqueeTrack}>
            {marquee.map((t, i) => <BkImage key={`${t.id}-${i}`} path={t.logo} alt={t.abbr} className={styles.marqueeLogo} />)}
          </div>
        </div>
        <div className={styles.footRow}>
          <span>Alpha build</span>
          <span>NBA · EuroLeague</span>
        </div>
      </div>
    </div>
  );
}
