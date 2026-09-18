import styles from './TopBar.module.css';

interface Props {
  title: string;
  subtitle?: string;
  onContinue?: () => void;
  continueLabel?: string;
}

export default function TopBar({ title, subtitle, onContinue, continueLabel = 'Continue' }: Props) {
  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        <div className={styles.titleRow}>
          <span className={styles.title}>{title}</span>
          <span className={styles.help}>
            <span className={styles.helpKey}>H</span> Help
          </span>
        </div>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </div>
      {onContinue && (
        <button type="button" className={styles.continue} onClick={onContinue}>
          <span>{continueLabel}</span>
          <span className={styles.chevron}>&#10148;</span>
        </button>
      )}
    </div>
  );
}
