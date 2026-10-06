import { useState } from 'react';
import HeroHeader from '../components/HeroHeader';
import SectionCard from '../components/SectionCard';
import { useGame, useGameState } from '../store/useGame';
import { useUI } from '../store/useUI';
import Preferences from '../components/Preferences';
import { formatDate } from '../format';
import styles from './SettingsScreen.module.css';

export default function SettingsScreen() {
  const s = useGameState();
  const slot = useGame((g) => g.slot);
  const save = useGame((g) => g.save);
  const reset = useGame((g) => g.reset);
  const setView = useUI((v) => v.setView);
  const [status, setStatus] = useState<string | null>(null);

  if (!s) return null;
  const team = s.teams[s.userTeamId];

  const doSave = async () => {
    setStatus('Saving…');
    await save();
    setStatus('Saved');
    setTimeout(() => setStatus(null), 1500);
  };

  const saveAndQuit = async () => {
    await save();
    reset();
    setView('startMenu');
  };

  return (
    <div className={styles.screen}>
      <HeroHeader title="Settings" subtitle="Preferences" />
      <div className={styles.wrap}>
      <SectionCard title="Save" accent className={styles.panel}>
        <div className={styles.info}>
          <div><span className={styles.label}>Slot</span><span>{slot ?? '-'}</span></div>
          <div><span className={styles.label}>Team</span><span>{team.city} {team.name}</span></div>
          <div><span className={styles.label}>Date</span><span>{formatDate(s.date)}</span></div>
          <div><span className={styles.label}>Phase</span><span className={styles.phase}>{s.phase}</span></div>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.btn} onClick={doSave}>Save Now</button>
          <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={saveAndQuit}>Save &amp; Quit to Menu</button>
        </div>
        {status && <div className={styles.status}>{status}</div>}
      </SectionCard>

      <Preferences panelClass={styles.panel} />
      </div>
    </div>
  );
}
