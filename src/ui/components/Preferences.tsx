import SectionCard from './SectionCard';
import { useAudioSettings, play, type SoundName } from '../sound';
import { useDisplaySettings } from '../store/useDisplaySettings';
import styles from '../screens/SettingsScreen.module.css';

const TEST_SOUNDS: SoundName[] = ['click', 'confirm', 'error', 'swish', 'whistle', 'buzzer'];

/** Audio + display preferences. Needs no game loaded, so the title screen can use it too. */
export default function Preferences({ panelClass }: { panelClass?: string }) {
  const audio = useAudioSettings();
  const display = useDisplaySettings();
  return (
    <>
      <SectionCard title="Audio" className={panelClass}>
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

      <SectionCard title="Display" className={panelClass}>
        <label className={styles.toggleRow}>
          <span className={styles.label}>Reduce animations</span>
          <input
            type="checkbox"
            checked={display.reduceMotion}
            onChange={(e) => display.setReduceMotion(e.target.checked)}
          />
        </label>
      </SectionCard>
    </>
  );
}
