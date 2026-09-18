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
}

export default function DataTable<T>({ columns, rows, rowKey, highlightedRowKey, compact, onRowClick, rowClass }: Props<T>) {
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
        {rows.map((row) => {
          const key = rowKey(row);
          const highlighted = key === highlightedRowKey;
          const extra = rowClass?.(row);
          return (
            <tr
              key={key}
              className={[styles.row, highlighted && styles.highlighted, extra].filter(Boolean).join(' ')}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={onRowClick ? { cursor: 'pointer' } : undefined}
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
