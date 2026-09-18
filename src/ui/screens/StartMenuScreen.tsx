import { useEffect, useState } from 'react';
import { useUI } from '../store/useUI';
import { deleteSave, listSaves } from '../saves';
import type { SaveMeta } from '../../types/bk';
import styles from './StartMenuScreen.module.css';

type Mode = 'menu' | 'load' | 'settings';

export default function StartMenuScreen() {
  const setView = useUI((s) => s.setView);
  const [mode, setMode] = useState<Mode>('menu');
  const [saves, setSaves] = useState<SaveMeta[]>([]);

  useEffect(() => {
    if (mode === 'load') {
      listSaves().then(setSaves).catch(() => setSaves([]));
    }
  }, [mode]);

  return (
    <div className={styles.wrap}>
      <div className={styles.panel}>
        <div className={styles.title}>
          BK <span>MANAGER</span>
        </div>

        {mode === 'menu' && (
          <div className={styles.menu}>
            <button type="button" className={styles.item} onClick={() => setView('chooseTeam')}>
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

        {mode === 'load' && (
          <div className={styles.menu}>
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
                  <button type="button" className={styles.smallBtn} onClick={() => setView('shell')}>
                    Load
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
