interface Props {
  className?: string;
}

export default function Silhouette({ className }: Props) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <rect width="100" height="100" fill="#1c2338" />
      <circle cx="50" cy="38" r="18" fill="#2c3450" />
      <path d="M14 100c0-24 16-38 36-38s36 14 36 38z" fill="#2c3450" />
    </svg>
  );
}
