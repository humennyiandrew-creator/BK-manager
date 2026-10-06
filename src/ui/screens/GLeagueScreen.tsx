import HeroHeader from '../components/HeroHeader';
import Panel from '../components/Panel';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import { toast } from '../components/Toasts';
import { useGame, useGameState } from '../store/useGame';
import { useUI } from '../store/useUI';
import { affiliateName, affiliateRoster, assign, canAssign, gleagueLine, hasAffiliate, recall } from '../../engine/gleague';
import { offerContract } from '../../engine/freeagency';
import { ageOf } from '../../engine/ratings';
import type { GameState, Player } from '../../engine/model';
import styles from './GLeagueScreen.module.css';

const per = (n: number, gp: number) => (gp ? (n / gp).toFixed(1) : '–');

function lineCols(s: GameState): DataTableColumn<Player>[] {
  return [
    { key: 'gp', header: 'GP', align: 'right', render: (p) => gleagueLine(p, s.season)?.gp ?? 0 },
    { key: 'min', header: 'Min', align: 'right', render: (p) => { const l = gleagueLine(p, s.season); return l ? per(l.min, l.gp) : '–'; } },
    { key: 'pts', header: 'Pts', align: 'right', render: (p) => { const l = gleagueLine(p, s.season); return l ? per(l.pts, l.gp) : '–'; }, sortValue: (p) => { const l = gleagueLine(p, s.season); return l ? l.pts / l.gp : 0; } },
    { key: 'reb', header: 'Reb', align: 'right', render: (p) => { const l = gleagueLine(p, s.season); return l ? per(l.reb, l.gp) : '–'; } },
    { key: 'ast', header: 'Ast', align: 'right', render: (p) => { const l = gleagueLine(p, s.season); return l ? per(l.ast, l.gp) : '–'; } },
  ];
}

/** Your G League affiliate: who is down there, who could go, and who you could call up. */
export default function GLeagueScreen() {
  const s = useGameState();
  const mutate = useGame((g) => g.mutate);
  const openPlayer = useUI((u) => u.openPlayer);
  if (!s) return null;
  const team = s.teams[s.userTeamId];
  if (!hasAffiliate(s, team.id)) {
    return (
      <div className={styles.screen}>
        <HeroHeader title="G League" subtitle="European clubs have no affiliate" />
      </div>
    );
  }
  const age = (p: Player) => Math.floor(ageOf(p.birthDate, new Date(s.date)));
  const down = affiliateRoster(s, team.id).filter((p) => p.teamId === team.id);
  const unsigned = affiliateRoster(s, team.id).filter((p) => !p.teamId);
  const eligible = Object.values(s.players).filter((p) => p.teamId === team.id && !p.retired && canAssign(s, p)).sort((a, b) => b.ratings.ovr - a.ratings.ovr);

  const act = (fn: (st: GameState) => string | null, ok: string) => {
    let err: string | null = null;
    mutate((st) => { err = fn(st); });
    toast(err ?? ok, err ? 'error' : 'success');
  };

  const who: DataTableColumn<Player>[] = [
    { key: 'name', header: 'Player', render: (p) => <button type="button" className={styles.name} onClick={() => openPlayer(p.id)}>{p.firstName} {p.lastName}</button>, sortValue: (p) => p.lastName },
    { key: 'pos', header: 'Pos', render: (p) => p.positions.join('/') },
    { key: 'age', header: 'Age', align: 'right', render: (p) => age(p), sortValue: age },
    { key: 'ovr', header: 'OVR', align: 'right', render: (p) => <strong>{p.ratings.ovr}</strong>, sortValue: (p) => p.ratings.ovr },
    { key: 'pot', header: 'POT', align: 'right', render: (p) => p.ratings.pot, sortValue: (p) => p.ratings.pot },
  ];

  const downCols = [...who, ...lineCols(s), {
    key: 'act', header: '', align: 'right' as const,
    render: (p: Player) => <button type="button" className={styles.btn} onClick={() => act((st) => recall(st, p.id), `${p.lastName} recalled`)}>Recall</button>,
  }];
  const eligibleCols = [...who, {
    key: 'mpg', header: 'NBA min', align: 'right' as const, render: (p: Player) => (p.season.gp ? (p.season.min / p.season.gp).toFixed(1) : '–'),
  }, {
    key: 'act', header: '', align: 'right' as const,
    render: (p: Player) => <button type="button" className={styles.btn} onClick={() => act((st) => assign(st, p.id), `${p.lastName} sent to the ${affiliateName(s, team.id)}`)}>Send down</button>,
  }];
  const unsignedCols = [...who, ...lineCols(s), {
    key: 'act', header: '', align: 'right' as const,
    render: (p: Player) => (
      <span className={styles.actions}>
        {p.yearsPro <= 4 && p.ratings.ovr <= 72 && (
          <button type="button" className={styles.btn} onClick={() => act((st) => offerContract(st, team.id, p.id, 0, 1, true), `${p.lastName} signed to a two-way deal`)}>Two-way</button>
        )}
        <button type="button" className={styles.btnQuiet} onClick={() => openPlayer(p.id)}>Profile</button>
      </span>
    ),
  }];

  return (
    <div className={styles.screen}>
      <HeroHeader title={affiliateName(s, team.id)} subtitle={`G League affiliate of the ${team.city} ${team.name}`} />
      <div className={styles.grid}>
        <div className={styles.col}>
          <Panel title={`On assignment (${down.length})`} flush>
            <DataTable columns={downCols} rows={down} rowKey={(p) => p.id} compact emptyLabel="Nobody is on assignment" />
          </Panel>
          <Panel title="Could be sent down" flush>
            <DataTable columns={eligibleCols} rows={eligible} rowKey={(p) => p.id} compact emptyLabel="No eligible players" />
            <p className={styles.note}>
              Players in their first three seasons, or on two-way deals, can be assigned. They miss NBA games while down,
              but regular minutes count towards development. Established players may not enjoy the trip.
            </p>
          </Panel>
        </div>
        <Panel title={`Affiliate players (${unsigned.length})`} flush>
          <DataTable columns={unsignedCols} rows={unsigned} rowKey={(p) => p.id} compact emptyLabel="The affiliate has no players of its own" />
          <p className={styles.note}>
            Undrafted prospects and journeymen playing for the affiliate. They are free agents: sign one outright,
            or give a young player a two-way contract.
          </p>
        </Panel>
      </div>
    </div>
  );
}
