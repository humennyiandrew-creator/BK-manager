import { useEffect, useState } from 'react';
import { useUI } from '../store/useUI';
import { useGame } from '../store/useGame';
import { deleteSave, listSaves } from '../saves';
import type { SaveMeta } from '../../types/bk';
import styles from './StartMenuScreen.module.css';

type Mode = 'menu' | 'load' | 'newSlot' | 'settings';

export default function StartMenuScreen() {
  const setView = useUI((s) => s.setView);
  const setPendingSlot = useUI((s) => s.setPendingSlot);
  const load = useGame((s) => s.load);
  const loadError = useGame((s) => s.loadError);
  const [mode, setMode] = useState<Mode>('menu');
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [confirmSlot, setConfirmSlot] = useState<number | null>(null);
  const [loadingSlot, setLoadingSlot] = useState<number | null>(null);

  useEffect(() => {
    if (mode === 'load' || mode === 'newSlot') {
      listSaves().then(setSaves).catch(() => setSaves([]));
    }
  }, [mode]);

  const saveFor = (slot: number) => saves.find((s) => s.slot === slot);

  const pickSlot = (slot: number) => {
    if (saveFor(slot)) {
      setConfirmSlot(slot);
      return;
    }
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

  return (
    <div className={styles.wrap}>
      <div className={`${styles.panel} diagonal-accent`}>
        <div className={styles.title}>
          <span className={styles.slash}>// </span>BK <span>MANAGER</span>
        </div>

        {mode === 'menu' && (
          <div className={styles.menu}>
            <button type="button" className={styles.item} onClick={() => setMode('newSlot')}>
              New Game
            </button>
            <button type="button" className={styles.item} onClick={() => setMode('load')}>
              Load Game
            </button>
            <button type="button" className={styles.item} onClick={() => setMode('settings')}>
              Settings
            </button>
            <button type="button" className={styles.item} onClick={() => window.close()}>
              Quit
            </button>
          </div>
        )}

        {mode === 'newSlot' && (
          <div className={styles.menu}>
            {[1, 2, 3, 4, 5].map((slot) => {
              const save = saveFor(slot);
              return (
                <div key={slot} className={styles.saveRow}>
                  <div>
                    <div>{save ? save.teamName : `Slot ${slot} — empty`}</div>
                    {save && <div className={styles.saveMeta}>{save.date} · saved {new Date(save.savedAt).toLocaleDateString()}</div>}
                  </div>
                  {confirmSlot === slot ? (
                    <div className={styles.saveActions}>
                      <span className={styles.saveMeta}>Overwrite?</span>
                      <button type="button" className={styles.smallBtn} onClick={confirmOverwrite}>Yes</button>
                      <button type="button" className={styles.smallBtn} onClick={() => setConfirmSlot(null)}>No</button>
                    </div>
                  ) : (
                    <button type="button" className={styles.smallBtn} onClick={() => pickSlot(slot)}>
                      {save ? 'Overwrite' : 'Select'}
                    </button>
                  )}
                </div>
              );
            })}
            <button type="button" className={styles.back} onClick={() => setMode('menu')}>
              &#8592; Back
            </button>
          </div>
        )}

        {mode === 'load' && (
          <div className={styles.menu}>
            {loadError && <div className={styles.empty}>{loadError}</div>}
            {saves.length === 0 && <div className={styles.empty}>No saved games</div>}
            {saves.map((s) => (
              <div key={s.slot} className={styles.saveRow}>
                <div>
                  <div>{s.teamName}</div>
                  <div className={styles.saveMeta}>
                    {s.date} · slot {s.slot}
                  </div>
                </div>
                <div className={styles.saveActions}>
                  <button type="button" className={styles.smallBtn} onClick={() => doLoad(s.slot)} disabled={loadingSlot === s.slot}>
                    {loadingSlot === s.slot ? 'Loading…' : 'Load'}
                  </button>
                  <button
                    type="button"
                    className={styles.smallBtn}
                    onClick={() => deleteSave(s.slot).then(() => listSaves()).then(setSaves)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            <button type="button" className={styles.back} onClick={() => setMode('menu')}>
              &#8592; Back
            </button>
          </div>
        )}

        {mode === 'settings' && (
          <div className={styles.menu}>
            <div className={styles.empty}>Settings coming soon</div>
            <button type="button" className={styles.back} onClick={() => setMode('menu')}>
              &#8592; Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
