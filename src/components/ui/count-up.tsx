'use client';

import * as React from 'react';
import { cn, formatNumber } from '@/lib/utils';

/**
 * Counts a number up on mount. Points landing beats points appearing.
 *
 * Under `prefers-reduced-motion` the final value is shown immediately - the
 * information is never withheld, only the animation is dropped.
 */
export function CountUp({
  to,
  durationMs = 700,
  prefix = '',
  className,
  format = true,
}: {
  to: number;
  durationMs?: number;
  prefix?: string;
  className?: string;
  format?: boolean;
}) {
  const [value, setValue] = React.useState(() => (prefersReducedMotion() ? to : 0));

  React.useEffect(() => {
    if (prefersReducedMotion() || to === 0) {
      setValue(to);
      return;
    }

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      // Ease-out cubic: fast at first, settles on the final digits.
      setValue(Math.round(to * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, durationMs]);

  return (
    <span className={cn('tnum', className)}>
      {prefix}
      {format ? formatNumber(value) : value}
    </span>
  );
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Rank ticker: the old rank slides out upward, the new one rises in.
 * Used on the between-round recap, where the climb is the whole point.
 */
export function RankTicker({
  from,
  to,
  className,
}: {
  from: number | null;
  to: number;
  className?: string;
}) {
  const [showNew, setShowNew] = React.useState(from === null || prefersReducedMotion());

  React.useEffect(() => {
    if (from === null || prefersReducedMotion()) {
      setShowNew(true);
      return;
    }
    const id = window.setTimeout(() => setShowNew(true), 650);
    return () => window.clearTimeout(id);
  }, [from, to]);

  return (
    <span className={cn('relative inline-flex overflow-hidden tnum', className)}>
      <span
        key={showNew ? 'new' : 'old'}
        className={showNew ? 'animate-ticker-up' : undefined}
      >
        #{showNew ? to : from}
      </span>
    </span>
  );
}
