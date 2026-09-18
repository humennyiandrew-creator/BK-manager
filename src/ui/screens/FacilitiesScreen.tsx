import Panel from '../components/Panel';
import ProgressBar from '../components/ProgressBar';
import { useGameState, useGame } from '../store/useGame';
import { FACILITY_IDS, FACILITY_LABEL, FACILITY_EFFECT, facilityLevel, upgradeCost, startUpgrade } from '../../engine/mgmt/facilities';
import { formatMoneyShort } from '../format';
import { daysUntil } from '../selectors';
import styles from './FacilitiesScreen.module.css';

export default function FacilitiesScreen() {
  const s = useGameState();
  const mutate = useGame((g) => g.mutate);
  if (!s) return null;

  const doUpgrade = (id: (typeof FACILITY_IDS)[number]) => mutate((st) => startUpgrade(st, id));

  return (
    <div className={styles.wrap}>
      <Panel title="Facilities" className={styles.panel} flush>
        <div className={styles.grid}>
          {FACILITY_IDS.map((id) => {
            const level = facilityLevel(s, s.userTeamId, id);
            const fac = s.facilities[s.userTeamId][id];
            const { cost, days } = upgradeCost(s, s.userTeamId, id);
            const maxed = level >= 5;
            const inProgress = !!fac.upgrade;
            const canAfford = s.finance.cash >= cost;
            return (
              <div key={id} className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.cardTitle}>{FACILITY_LABEL[id]}</span>
                  <span className={styles.level}>Lv {level}</span>
                </div>
                <div className={styles.pips}>
                  {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= level ? styles.pipFilled : styles.pip} />)}
                </div>
                <p className={styles.effect}>{FACILITY_EFFECT[id]}</p>
                {inProgress ? (
                  <div className={styles.progress}>
                    <ProgressBar value={days - daysUntil(s, fac.upgrade!.done)} max={days || 1} />
                    <span className={styles.progressLabel}>Upgrading to Lv {fac.upgrade!.to} — {Math.max(0, daysUntil(s, fac.upgrade!.done))} days left</span>
                  </div>
                ) : maxed ? (
                  <div className={styles.maxed}>Maximum level reached</div>
                ) : (
                  <div className={styles.upgradeRow}>
                    <span className={styles.cost}>{formatMoneyShort(cost)} · {days}d</span>
                    <button type="button" className={styles.upgradeBtn} disabled={!canAfford} onClick={() => doUpgrade(id)}>
                      Upgrade
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
