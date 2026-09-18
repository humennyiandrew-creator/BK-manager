import type { ReactNode } from 'react';
import styles from './ConfirmDialog.module.css';

interface Props {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel }: Props) {
  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.title}>{title}</div>
        <div className={styles.message}>{message}</div>
        <div className={styles.btns}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button type="button" className={danger ? styles.dangerBtn : styles.confirmBtn} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
