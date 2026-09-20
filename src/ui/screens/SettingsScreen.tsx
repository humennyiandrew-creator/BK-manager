import { useState } from 'react';
import HeroHeader from '../components/HeroHeader';
import SectionCard from '../components/SectionCard';
import { useGame, useGameState } from '../store/useGame';
import { useUI } from '../store/useUI';
import { useAudioSettings, play, type SoundName } from '../sound';
import { useDisplaySettings } from '../store/useDisplaySettings';
import { formatDate } from '../format';
import styles from './SettingsScreen.module.css';

const TEST_SOUNDS: SoundName[] = ['click', 'confirm', 'error', 'swish', 'whistle', 'buzzer'];

export default function SettingsScreen() {
  const s = useGameState();
  const slot = useGame((g) => g.slot);
  const save = useGame((g) => g.save);
  const reset = useGame((g) => g.reset);
  const setView = useUI((v) => v.setView);
  const [status, setStatus] = useState<string | null>(null);
  const audio = useAudioSettings();
  const display = useDisplaySettings();

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

      <SectionCard title="Audio" className={styles.panel}>
        <label className={styles.sliderRow}>
          <span className={styles.label}>Master</span>
          <input
            type="range" min={0} max={1} step={0.01}
            value={audio.master}
            onChange={(e) => audio.setMaster(Number(e.target.value))}
          />
        </label>
        <label className={styles.sliderRow}>
          <span className={styles.label}>SFX</span>
          <input
            type="range" min={0} max={1} step={0.01}
            value={audio.sfx}
            onChange={(e) => audio.setSfx(Number(e.target.value))}
          />
        </label>
        <label className={styles.sliderRow}>
          <span className={styles.label}>Ambience</span>
          <input
            type="range" min={0} max={1} step={0.01}
            value={audio.ambience}
            onChange={(e) => audio.setAmbience(Number(e.target.value))}
          />
        </label>
        <label className={styles.toggleRow}>
          <span className={styles.label}>Mute</span>
          <input
            type="checkbox"
            checked={audio.muted}
            onChange={(e) => audio.setMuted(e.target.checked)}
          />
        </label>
        <div className={styles.testRow}>
          {TEST_SOUNDS.map((name) => (
            <button
              key={name}
              type="button"
              className={styles.testBtn}
              data-sound="none"
              onClick={() => play(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Display" className={styles.panel}>
        <label className={styles.toggleRow}>
          <span className={styles.label}>Reduce animations</span>
          <input
            type="checkbox"
            checked={display.reduceMotion}
            onChange={(e) => display.setReduceMotion(e.target.checked)}
          />
        </label>
      </SectionCard>
      </div>
    </div>
  );
}
