import type { ReactNode } from 'react';
import styles from './DataTable.module.css';

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
}

interface Props<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  highlightedRowKey?: string;
  compact?: boolean;
  onRowClick?: (row: T) => void;
  rowClass?: (row: T) => string | undefined;
  /** Fade-in the first 20 rows on mount with a per-row stagger delay. */
  animateRows?: boolean;
}

export default function DataTable<T>({ columns, rows, rowKey, highlightedRowKey, compact, onRowClick, rowClass, animateRows }: Props<T>) {
  return (
    <table className={compact ? `${styles.table} ${styles.compact}` : styles.table}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key} className={col.align === 'right' ? styles.alignRight : undefined}>
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const key = rowKey(row);
          const highlighted = key === highlightedRowKey;
          const extra = rowClass?.(row);
          const animate = animateRows && i < 20;
          return (
            <tr
              key={key}
              className={[styles.row, highlighted && styles.highlighted, extra, animate && 'fade-in'].filter(Boolean).join(' ')}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={onRowClick ? { cursor: 'pointer', ...(animate ? { animationDelay: `${i * 18}ms` } : {}) } : animate ? { animationDelay: `${i * 18}ms` } : undefined}
            >
              {columns.map((col) => (
                <td key={col.key} className={col.align === 'right' ? styles.alignRight : undefined}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
