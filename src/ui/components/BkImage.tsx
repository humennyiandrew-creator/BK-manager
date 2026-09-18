import { useState } from 'react';
import Silhouette from './Silhouette';

interface Props {
  path: string | null;
  alt: string;
  className?: string;
}

export default function BkImage({ path, alt, className }: Props) {
  const [failed, setFailed] = useState(false);

  if (!path || failed) {
    return <Silhouette className={className} />;
  }

  return <img src={`bkdata://${path}`} alt={alt} className={className} onError={() => setFailed(true)} />;
}
