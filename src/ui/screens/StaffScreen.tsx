import { useMemo, useState } from 'react';
import Panel from '../components/Panel';
import ProgressBar from '../components/ProgressBar';
import { useGameState, useGame } from '../store/useGame';
import { ROLES, ROLE_LABEL, STAFF_BUDGET, hireStaff, fireStaff, staffCourses, enrollStaff, type StaffCourse } from '../../engine/mgmt/staff';
import type { Staff, StaffRole } from '../../engine/model';
import { formatMoneyShort } from '../format';
import { attrVariant } from '../attrGroups';
import styles from './StaffScreen.module.css';

export default function StaffScreen() {
  const s = useGameState();
  const mutate = useGame((g) => g.mutate);
  const [filter, setFilter] = useState<StaffRole>('assistantOff');
  const [error, setError] = useState<string | null>(null);
  const [courseFor, setCourseFor] = useState<string | null>(null);

  const current = useMemo(() => {
    if (!s) return {} as Record<StaffRole, Staff | undefined>;
    const map = {} as Record<StaffRole, Staff | undefined>;
    for (const r of ROLES) map[r] = s.staff.find((x) => x.teamId === s.userTeamId && x.role === r);
    return map;
  }, [s]);

  const market = useMemo(
    () => (s ? s.staff.filter((x) => x.teamId === null && x.role === filter).sort((a, b) => b.rating - a.rating) : []),
    [s, filter]
  );

  if (!s) return null;

  const spend = ROLES.reduce((sum, r) => sum + (current[r]?.salary ?? 0), 0);
  const cap = STAFF_BUDGET * s.board.budgetMul;

  const doHire = (id: string) => {
    let err: string | null = null;
    mutate((st) => { err = hireStaff(st, id, 3); });
    setError(err);
  };
  const doFire = (id: string) => {
    mutate((st) => fireStaff(st, id));
    setError(null);
  };
  const doEnroll = (id: string, course: StaffCourse) => {
    let err: string | null = null;
    mutate((st) => { err = enrollStaff(st, id, course); });
    setError(err);
    setCourseFor(null);
  };

  return (
    <div className={styles.wrap}>
      <Panel
        title="Current Staff"
        className={styles.panel}
        headerRight={<span className={spend > cap ? styles.overBudget : styles.budgetLabel}>{formatMoneyShort(spend)} / {formatMoneyShort(cap)}</span>}
      >
        <div className={styles.budgetBar}><ProgressBar value={spend} max={cap} variant={spend > cap ? 'negative' : 'cyan'} /></div>
        <div className={styles.roleList}>
          {ROLES.map((r) => {
            const st = current[r];
            const options = st && courseFor === st.id ? staffCourses(s, st.id) : null;
            return (
              <div key={r} className={styles.roleGroup}>
                <div className={styles.roleRow}>
                  <div className={styles.roleInfo}>
                    <span className={styles.roleName}>{ROLE_LABEL[r]}</span>
                    <span className={styles.staffName}>{st ? st.name : 'Vacant'}</span>
                  </div>
                  <ProgressBar value={st?.rating ?? 40} variant={attrVariant(st?.rating ?? 40)} className={styles.ratingBar} />
                  <span className={styles.ratingValue}>{st?.rating ?? 40}</span>
                  <span className={styles.salary}>{st ? formatMoneyShort(st.salary) : '-'}</span>
                  <span className={styles.years}>{st ? `${st.years}yr` : '-'}</span>
                  <button type="button" className={styles.fireBtn} disabled={!st} onClick={() => st && doFire(st.id)}>Fire</button>
                </div>
                {st && (
                  <div className={styles.devRow}>
                    <span className={styles.xpLabel}>XP</span>
                    <ProgressBar value={st.xp ?? 0} max={100} variant="cyan" className={styles.xpBar} />
                    {st.course ? (
                      <span className={styles.courseStatus}>{st.course.name}: {st.course.weeksLeft}wk left (+{st.course.gain})</span>
                    ) : (
                      <button type="button" className={styles.courseBtn} onClick={() => setCourseFor(courseFor === st.id ? null : st.id)}>
                        {courseFor === st.id ? 'Close' : 'Courses'}
                      </button>
                    )}
                  </div>
                )}
                {options && (
                  <div className={styles.courseOptions}>
                    {options.map((c, i) => (
                      <button key={i} type="button" className={styles.courseOption} onClick={() => st && doEnroll(st.id, c)}>
                        {c.name} · {c.weeks}wk · {formatMoneyShort(c.cost)} · +{c.gain} rating
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Staff Market" className={styles.panel} flush>
        <div className={styles.tabs}>
          {ROLES.map((r) => (
            <button key={r} type="button" className={filter === r ? styles.tabActive : styles.tab} onClick={() => setFilter(r)}>
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.marketList}>
          {market.map((st) => (
            <div key={st.id} className={styles.marketRow}>
              <div className={styles.roleInfo}>
                <span className={styles.staffName}>{st.name}</span>
                <span className={styles.staffMeta}>Age {st.age}</span>
              </div>
              <ProgressBar value={st.rating} variant={attrVariant(st.rating)} className={styles.ratingBar} />
              <span className={styles.ratingValue}>{st.rating}</span>
              <span className={styles.salary}>{formatMoneyShort(st.salary)}</span>
              <button type="button" className={styles.hireBtn} onClick={() => doHire(st.id)}>Hire</button>
            </div>
          ))}
          {market.length === 0 && <div className={styles.empty}>No free agents available at this role.</div>}
        </div>
      </Panel>
    </div>
  );
}
