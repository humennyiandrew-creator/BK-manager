import { useState } from 'react';
import Panel from '../components/Panel';
import ProgressBar from '../components/ProgressBar';
import { useGameState, useGame } from '../store/useGame';
import {
  FACILITY_IDS, FACILITY_LABEL, FACILITY_EFFECT, NODES_BY_FACILITY, facilityLevel, upgradeCost, startUpgrade, startNode,
} from '../../engine/mgmt/facilities';
import type { FacilityId } from '../../engine/model';
import { formatMoneyShort } from '../format';
import { daysUntil } from '../selectors';
import styles from './FacilitiesScreen.module.css';

type NodeState = 'locked' | 'available' | 'building' | 'built';

export default function FacilitiesScreen() {
  const s = useGameState();
  const mutate = useGame((g) => g.mutate);
  const [active, setActive] = useState<FacilityId>('training');
  if (!s) return null;

  const doUpgrade = (id: FacilityId) => mutate((st) => startUpgrade(st, id));
  const doNode = (nodeId: string) => mutate((st) => startNode(st, nodeId));

  const fac = s.facilities[s.userTeamId][active];
  const nodes = NODES_BY_FACILITY[active];
  const builtLevels = FACILITY_IDS.reduce((sum, id) => sum + facilityLevel(s, s.userTeamId, id), 0);
  const totalNodes = FACILITY_IDS.reduce((sum, id) => sum + (s.facilities[s.userTeamId][id].nodes?.length ?? 0), 0);
  const monthlyMaint = builtLevels * 0.25 + totalNodes * 0.1;

  return (
    <div className={styles.wrap}>
      <Panel title="Facilities" className={styles.panel} flush>
        <div className={styles.grid}>
          {FACILITY_IDS.map((id) => {
            const level = facilityLevel(s, s.userTeamId, id);
            const f = s.facilities[s.userTeamId][id];
            const { cost, days } = upgradeCost(s, s.userTeamId, id);
            const maxed = level >= 5;
            const inProgress = !!f.upgrade;
            const canAfford = s.finance.cash >= cost;
            return (
              <button key={id} type="button" className={id === active ? `${styles.card} ${styles.cardActive}` : styles.card} onClick={() => setActive(id)}>
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
                    <ProgressBar value={days - daysUntil(s, f.upgrade!.done)} max={days || 1} />
                    <span className={styles.progressLabel}>Upgrading to Lv {f.upgrade!.to} — {Math.max(0, daysUntil(s, f.upgrade!.done))}d left</span>
                  </div>
                ) : maxed ? (
                  <div className={styles.maxed}>Maximum level reached</div>
                ) : (
                  <div className={styles.upgradeRow}>
                    <span className={styles.cost}>{formatMoneyShort(cost)} · {days}d</span>
                    <button
                      type="button" className={styles.upgradeBtn} disabled={!canAfford}
                      onClick={(e) => { e.stopPropagation(); doUpgrade(id); }}
                    >
                      Upgrade
                    </button>
                  </div>
                )}
                <span className={styles.nodeCount}>{f.nodes?.length ?? 0}/{NODES_BY_FACILITY[id].length} nodes built</span>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel
        title={`${FACILITY_LABEL[active]} — Upgrade Tree`}
        headerRight={<span className={styles.maintLine}>Monthly maintenance: ${monthlyMaint.toFixed(2)}M</span>}
        className={styles.treePanel}
        flush
      >
        <div className={styles.tree}>
          {nodes.map((node) => {
            const built = fac.nodes?.includes(node.id) ?? false;
            const building = fac.building?.node === node.id;
            const locked = !built && !building && node.prereq.some((p) => !fac.nodes?.includes(p));
            const state: NodeState = built ? 'built' : building ? 'building' : locked ? 'locked' : 'available';
            const canAfford = s.finance.cash >= node.cost;
            const blocked = !!fac.building && !building;
            return (
              <div key={node.id} className={styles.nodeWrap}>
                {node.prereq.length > 0 && <span className={styles.nodeLine} />}
                <div className={`${styles.node} ${styles['node_' + state]}`}>
                  <div className={styles.nodeHead}>
                    <span className={styles.nodeTitle}>{node.label}</span>
                    <span className={styles.nodeState}>{state === 'built' ? 'Built' : state === 'building' ? 'Building' : state === 'locked' ? 'Locked' : 'Available'}</span>
                  </div>
                  <p className={styles.nodeDesc}>{node.desc}</p>
                  {building && fac.building && (
                    <div className={styles.progress}>
                      <ProgressBar value={node.days - daysUntil(s, fac.building.done)} max={node.days || 1} variant="cyan" />
                      <span className={styles.progressLabel}>{Math.max(0, daysUntil(s, fac.building.done))}d left</span>
                    </div>
                  )}
                  {state === 'available' && (
                    <div className={styles.upgradeRow}>
                      <span className={styles.cost}>{formatMoneyShort(node.cost)} · {node.days}d</span>
                      <button type="button" className={styles.upgradeBtn} disabled={!canAfford || blocked} onClick={() => doNode(node.id)}>
                        Build
                      </button>
                    </div>
                  )}
                  {state === 'locked' && (
                    <span className={styles.lockedHint}>Requires {node.prereq.map((p) => NODES_BY_FACILITY[active].find((n) => n.id === p)?.label ?? p).join(', ')}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
