import BkImage from './BkImage';
import styles from './TeamBadge.module.css';

interface Props {
  logoPath: string | null;
  name: string;
  className?: string;
}

export default function TeamBadge({ logoPath, name, className }: Props) {
  return (
    <div className={`${styles.badge} ${className ?? ''}`}>
      <BkImage path={logoPath} alt={name} className={styles.logo} />
      <span className={styles.name}>{name}</span>
    </div>
  );
}
