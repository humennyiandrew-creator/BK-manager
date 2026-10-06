import { useMemo, useState, type ReactNode } from 'react';
import styles from './DataTable.module.css';

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
  /** Enables click-to-sort on this column's header. */
  sortValue?: (row: T) => number | string;
}

interface Props<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  highlightedRowKey?: string;
  compact?: boolean;
  onRowClick?: (row: T) => void;
  /** Right-side chevron button per row; fires instead of onRowClick when clicked. */
  onRowOpen?: (row: T) => void;
  rowClass?: (row: T) => string | undefined;
  /** Fade-in the first 20 rows on mount with a per-row stagger delay. */
  animateRows?: boolean;
  zebra?: boolean;
  emptyLabel?: string;
}

export default function DataTable<T>({
  columns, rows, rowKey, highlightedRowKey, compact, onRowClick, onRowOpen, rowClass, animateRows,
  zebra = true, emptyLabel = 'Nothing to show'
}: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return cmp * sort.dir;
    });
  }, [rows, sort, columns]);

  const toggleSort = (key: string) => {
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: -1 };
      if (cur.dir === -1) return { key, dir: 1 };
      return null;
    });
  };

  return (
    <table className={compact ? `${styles.table} ${styles.compact}` : styles.table}>
      <thead>
        <tr>
          {columns.map((col) => {
            const sortable = !!col.sortValue;
            const active = sort?.key === col.key;
            return (
              <th
                key={col.key}
                className={[col.align === 'right' ? styles.alignRight : '', sortable ? styles.sortable : ''].filter(Boolean).join(' ')}
                onClick={sortable ? () => toggleSort(col.key) : undefined}
              >
                <span className={styles.headInner}>
                  {col.header}
                  {sortable && <span className={active ? `${styles.sortArrow} ${styles.sortArrowActive}` : styles.sortArrow}>{active && sort!.dir === 1 ? '▲' : '▼'}</span>}
                </span>
              </th>
            );
          })}
          {onRowOpen && <th className={styles.chevronCol} aria-hidden="true" />}
        </tr>
      </thead>
      <tbody>
        {sortedRows.length === 0 && (
          <tr className={styles.emptyRow}>
            <td colSpan={columns.length + (onRowOpen ? 1 : 0)}>{emptyLabel}</td>
          </tr>
        )}
        {sortedRows.map((row, i) => {
          const key = rowKey(row);
          const highlighted = key === highlightedRowKey;
          const extra = rowClass?.(row);
          const animate = animateRows && i < 20;
          return (
            <tr
              key={key}
              className={[styles.row, zebra && i % 2 === 1 && styles.zebra, highlighted && styles.highlighted, extra, animate && 'fade-in'].filter(Boolean).join(' ')}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={onRowClick ? { cursor: 'pointer', ...(animate ? { animationDelay: `${i * 18}ms` } : {}) } : animate ? { animationDelay: `${i * 18}ms` } : undefined}
            >
              {columns.map((col) => (
                <td key={col.key} className={col.align === 'right' ? styles.alignRight : undefined}>
                  {col.render(row)}
                </td>
              ))}
              {onRowOpen && (
                <td className={styles.chevronCol}>
                  <button
                    type="button"
                    className={styles.chevronBtn}
                    data-sound="none"
                    onClick={(e) => { e.stopPropagation(); onRowOpen(row); }}
                    aria-label="Open"
                  >
                    <svg viewBox="0 0 6 10" width="6" height="10" aria-hidden="true"><path d="M1 1l4 4-4 4" stroke="currentColor" strokeWidth="1.6" fill="none" /></svg>
                  </button>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
