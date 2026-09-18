import { useState } from 'react';
import Panel from '../components/Panel';
import ProgressBar from '../components/ProgressBar';
import PlayDiagram from '../components/PlayDiagram';
import TacticFitPanel from '../components/TacticFitPanel';
import { useGame, useGameState } from '../store/useGame';
import { SYSTEMS, SCHEMES } from '../../engine/playbook/systems';
import { PLAYS } from '../../engine/playbook/plays';
import { refreshRotation } from '../../engine/rotation';
import { onTacticsChanged } from '../../engine/training';
import type { OffSystem, DefScheme, Play, PlayCategory, SchemeDef } from '../../engine/playbook/types';
import styles from './PlaybookScreen.module.css';

type SubTab = 'offense' | 'defense' | 'style' | 'rotation';

const CATEGORIES: (PlayCategory | 'all')[] = ['all', 'pnr', 'horns', 'off-ball', 'post', 'iso', 'motion', 'transition', 'zone-buster'];

const STYLE_SLIDERS: { key: 'pace' | 'threeFocus' | 'crashGlass' | 'transition'; label: string; hint: string }[] = [
  { key: 'threeFocus', label: 'Shot Profile', hint: 'Paint ↔ Perimeter — leaning away from your shot-makers costs efficiency' },
  { key: 'crashGlass', label: 'Crash Glass', hint: 'Get back ↔ Crash — extra offensive boards cost you in opponent transition' },
  { key: 'pace', label: 'Pace', hint: 'Slow ↔ Fast — faster pace needs handling and speed or it bleeds turnovers' },
  { key: 'transition', label: 'Transition', hint: 'Set ↔ Push — pushing every miss/make tires legs but creates easy points' }
];

const EFFECTS: { key: string; label: string; get: (s: SchemeDef) => number; invert?: boolean }[] = [
  { key: 'rim', label: 'Rim Protection', get: (s) => s.rimD },
  { key: 'perim', label: 'Perimeter', get: (s) => s.threeD },
  { key: 'pullup', label: 'Pull-up D', get: (s) => s.midD },
  { key: 'to', label: 'Turnovers Forced', get: (s) => s.toMul },
  { key: 'fouls', label: 'Fouls', get: (s) => s.foulMul },
  { key: 'fatigue', label: 'Fatigue', get: (s) => s.drainMul },
  { key: 'glass', label: 'Glass', get: (s) => -s.orbAllowed }
];
const schemeList = Object.values(SCHEMES);
function normalizer(get: (s: SchemeDef) => number) {
  const vals = schemeList.map(get);
  const min = Math.min(...vals), max = Math.max(...vals);
  return (v: number) => (max === min ? 50 : ((v - min) / (max - min)) * 100);
}
const NORMS = EFFECTS.map((e) => ({ ...e, norm: normalizer(e.get) }));

export default function PlaybookScreen() {
  const s = useGameState();
  const mutate = useGame((g) => g.mutate);
  const [subTab, setSubTab] = useState<SubTab>('offense');
  const [category, setCategory] = useState<PlayCategory | 'all'>('all');
  const [selectedPlayId, setSelectedPlayId] = useState<string>(PLAYS[0].id);

  if (!s) return null;
  const team = s.teams[s.userTeamId];
  const tactics = team.tactics;
  const selectedPlay = PLAYS.find((p) => p.id === selectedPlayId)!;

  const setOffense = (id: OffSystem) => mutate((st) => { st.teams[st.userTeamId].tactics.offense = id; onTacticsChanged(st.teams[st.userTeamId]); });
  const setDefense = (id: DefScheme) => mutate((st) => { st.teams[st.userTeamId].tactics.defense = id; onTacticsChanged(st.teams[st.userTeamId]); });
  const setSlider = (key: 'pace' | 'threeFocus' | 'crashGlass' | 'transition', v: number) =>
    mutate((st) => (st.teams[st.userTeamId].tactics[key] = v));
  const setFocus = (id: string) => mutate((st) => (st.teams[st.userTeamId].tactics.focusPlayer = id || null));
  const setClutch = (id: string) => mutate((st) => (st.teams[st.userTeamId].tactics.clutchPlay = id || null));

  const freqOverride = (id: string) => tactics.playWeights[id];
  const freqDefault = (id: string) => SYSTEMS[tactics.offense].plays[id] ?? 0;
  const setFreq = (id: string, v: number) => mutate((st) => (st.teams[st.userTeamId].tactics.playWeights[id] = Math.max(0, Math.min(3, v))));
  const resetFreq = (id: string) => mutate((st) => { delete st.teams[st.userTeamId].tactics.playWeights[id]; });

  const roster = Object.values(s.players).filter((p) => p.teamId === s.userTeamId);
  const filteredPlays = category === 'all' ? PLAYS : PLAYS.filter((p) => p.category === category);
  const systemPlays = Object.entries(SYSTEMS[tactics.offense].plays);

  const rotationPlayers = team.rotation.map((id) => s.players[id]).filter(Boolean);
  const totalMinutes = team.rotation.reduce((sum, id) => sum + (team.minutes[id] ?? 0), 0);

  function moveRotation(idx: number, dir: -1 | 1) {
    mutate((st) => {
      const t = st.teams[st.userTeamId];
      const j = idx + dir;
      if (j < 0 || j >= t.rotation.length) return;
      [t.rotation[idx], t.rotation[j]] = [t.rotation[j], t.rotation[idx]];
      t.customRotation = true;
    });
  }
  function setMinutes(id: string, v: number) {
    mutate((st) => {
      const t = st.teams[st.userTeamId];
      t.minutes[id] = Math.max(0, Math.min(48, v));
      t.customRotation = true;
    });
  }
  function autoRotationClick() {
    mutate((st) => {
      const t = st.teams[st.userTeamId];
      t.customRotation = false;
      refreshRotation(t, st.players);
    });
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.subTabs}>
        {(['offense', 'defense', 'style', 'rotation'] as SubTab[]).map((t) => (
          <button key={t} className={t === subTab ? `${styles.subTab} ${styles.subTabActive}` : styles.subTab} onClick={() => setSubTab(t)}>
            {t === 'offense' ? 'Offense' : t === 'defense' ? 'Defense' : t === 'style' ? 'Team Style' : 'Rotation'}
          </button>
        ))}
      </div>

      <div className={styles.mainRow}>
      <div className={styles.mainCol}>
      {subTab === 'offense' && (
        <div className={styles.offenseGrid}>
          <Panel title="Offensive Systems" className={styles.col}>
            <div className={styles.sysGrid}>
              {Object.values(SYSTEMS).map((sys) => (
                <button key={sys.id} className={sys.id === tactics.offense ? `${styles.sysCard} ${styles.sysCardActive}` : styles.sysCard} onClick={() => setOffense(sys.id)}>
                  <div className={styles.sysName}>{sys.name}</div>
                  <div className={styles.sysDesc}>{sys.desc}</div>
                  <div className={styles.chipRow}>
                    <span className={styles.chip}>Pace {sys.pace >= 0 ? '+' : ''}{sys.pace}</span>
                    <span className={styles.chip}>3PT ×{sys.threeMul.toFixed(2)}</span>
                    <span className={styles.chip}>AST ×{sys.assistMul.toFixed(2)}</span>
                  </div>
                </button>
              ))}
            </div>
            <div className={styles.sectionLabel}>Plays in System</div>
            <div className={styles.sysPlayList}>
              {systemPlays.map(([id, freq]) => {
                const p = PLAYS.find((x) => x.id === id);
                if (!p) return null;
                return (
                  <button key={id} className={styles.sysPlayRow} onClick={() => setSelectedPlayId(id)}>
                    <span>{p.name}</span>
                    <span className={styles.freqDots}>{'●'.repeat(freq)}{'○'.repeat(Math.max(0, 3 - freq))}</span>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel
            title="Play Library"
            className={styles.col}
            flush
            headerRight={
              <select className={styles.catSelect} value={category} onChange={(e) => setCategory(e.target.value as PlayCategory | 'all')}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c === 'all' ? 'All' : c}</option>)}
              </select>
            }
          >
            <div className={styles.playList}>
              {filteredPlays.map((p) => {
                const ov = freqOverride(p.id);
                const val = ov ?? freqDefault(p.id);
                return (
                  <div key={p.id} className={p.id === selectedPlayId ? `${styles.playRow} ${styles.playRowActive}` : styles.playRow} onClick={() => setSelectedPlayId(p.id)}>
                    <div className={styles.playRowMain}>
                      <span className={styles.playName}>{p.name}</span>
                      <span className={styles.playCat}>{p.category}</span>
                    </div>
                    <div className={styles.schemeChips}>
                      {p.strongVs.map((sc) => <span key={sc} className={styles.strongChip}>{SCHEMES[sc].name}</span>)}
                      {p.weakVs.map((sc) => <span key={sc} className={styles.weakChip}>{SCHEMES[sc].name}</span>)}
                    </div>
                    <div className={styles.freqStepper} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setFreq(p.id, val - 1)}>-</button>
                      <span className={ov != null ? styles.freqOverridden : undefined}>{val}</span>
                      <button onClick={() => setFreq(p.id, val + 1)}>+</button>
                      {ov != null && <button className={styles.resetBtn} onClick={() => resetFreq(p.id)}>Reset</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title={selectedPlay.name} className={styles.col}>
            <div className={styles.playDetail}>
              <div className={styles.diagramWrap}><PlayDiagram play={selectedPlay} /></div>
              <div className={styles.playDesc}>{selectedPlay.desc}</div>
              <div className={styles.keyAttrs}>
                {selectedPlay.keyAttrs.map((a) => <span key={a} className={styles.chip}>{a}</span>)}
              </div>
              <div className={styles.vsRow}>
                <div><span className={styles.vsLabel}>Strong vs</span>{selectedPlay.strongVs.map((sc) => SCHEMES[sc].name).join(', ') || '—'}</div>
                <div><span className={styles.vsLabel}>Weak vs</span>{selectedPlay.weakVs.map((sc) => SCHEMES[sc].name).join(', ') || '—'}</div>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {subTab === 'defense' && (
        <Panel title="Defensive Schemes" className={styles.fullPanel}>
          <div className={styles.schemeGrid}>
            {Object.values(SCHEMES).map((sc) => (
              <button key={sc.id} className={sc.id === tactics.defense ? `${styles.sysCard} ${styles.sysCardActive}` : styles.sysCard} onClick={() => setDefense(sc.id)}>
                <div className={styles.sysName}>{sc.name}</div>
                <div className={styles.sysDesc}>{sc.desc}</div>
                {NORMS.map((eff) => (
                  <div key={eff.key} className={styles.effectRow}>
                    <span className={styles.effectLabel}>{eff.label}</span>
                    <ProgressBar value={eff.norm(eff.get(sc))} variant="cyan" />
                  </div>
                ))}
              </button>
            ))}
          </div>
        </Panel>
      )}

      {subTab === 'style' && (
        <Panel title="Team Style" className={styles.fullPanel}>
          <div className={styles.styleWrap}>
            {STYLE_SLIDERS.map(({ key: k, label, hint }) => (
              <div key={k} className={styles.styleSliderWrap}>
                <div className={styles.styleSlider}>
                  <label>{label}</label>
                  <input type="range" min={0} max={100} value={tactics[k]} onChange={(e) => setSlider(k, Number(e.target.value))} />
                  <span>{tactics[k]}</span>
                </div>
                <div className={styles.styleHint}>{hint}</div>
              </div>
            ))}
            <div className={styles.styleField}>
              <label>Focus Player</label>
              <select value={tactics.focusPlayer ?? ''} onChange={(e) => setFocus(e.target.value)}>
                <option value="">None</option>
                {roster.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
              </select>
            </div>
            <div className={styles.styleField}>
              <label>Clutch Play</label>
              <select value={tactics.clutchPlay ?? ''} onChange={(e) => setClutch(e.target.value)}>
                <option value="">Auto</option>
                {PLAYS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
        </Panel>
      )}

      {subTab === 'rotation' && (
        <Panel
          title="Rotation"
          className={styles.fullPanel}
          headerRight={<button className={styles.autoBtn} onClick={autoRotationClick}>Auto</button>}
        >
          <div className={styles.rotationHead}>
            <span>Total Minutes: {totalMinutes}</span>
            {Math.abs(totalMinutes - 240) > 0.5 && <span className={styles.warn}>should sum to 240</span>}
          </div>
          <div className={styles.rotationList}>
            {rotationPlayers.map((p, i) => (
              <div key={p.id} className={p.injury ? `${styles.rotRow} ${styles.rotRowInjured}` : styles.rotRow}>
                <span className={styles.rotOrder}>{i + 1}</span>
                <span className={styles.rotName}>{p.firstName} {p.lastName}</span>
                <span className={styles.rotPos}>{p.positions[0]}</span>
                {p.injury ? <span className={styles.injChip}>{p.injury.name}</span> : (
                  <input
                    type="number" min={0} max={48} className={styles.rotMinutes}
                    value={team.minutes[p.id] ?? 0}
                    onChange={(e) => setMinutes(p.id, Number(e.target.value))}
                  />
                )}
                <div className={styles.rotBtns}>
                  <button disabled={i === 0} onClick={() => moveRotation(i, -1)}>↑</button>
                  <button disabled={i === rotationPlayers.length - 1} onClick={() => moveRotation(i, 1)}>↓</button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
      </div>
      <TacticFitPanel />
      </div>
    </div>
  );
}
