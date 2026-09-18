import { useUI } from '../store/useUI';
import BkImage from '../components/BkImage';
import { standingsEast, standingsWest } from '../data/fakeData';
import styles from './ChooseTeamScreen.module.css';

export default function ChooseTeamScreen() {
  const setView = useUI((s) => s.setView);
  const teams = [...standingsWest, ...standingsEast].map((r) => r.team);

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.back} onClick={() => setView('startMenu')}>
        &#8592; Back
      </button>
      <div className={styles.title}>Choose Your Team</div>
      <div className={styles.grid}>
        {teams.map((team) => (
          <button key={team.id} type="button" className={styles.team} onClick={() => setView('shell')}>
            <BkImage path={team.logo} alt={team.name} className={styles.logo} />
            <span className={styles.name}>{team.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
