import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  formatter?: (v: number) => string;
  durationMs?: number;
  className?: string;
}

function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }

/** Animates numeric changes with a rAF-driven easeOutCubic tween (~500ms default). */
export default function CountUp({ value, formatter, durationMs = 500, className }: Props) {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => { displayRef.current = display; }, [display]);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const from = displayRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = easeOutCubic(t);
      const next = from + (to - from) * eased;
      setDisplay(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  const text = formatter ? formatter(display) : String(Math.round(display));
  return <span className={className}>{text}</span>;
}
