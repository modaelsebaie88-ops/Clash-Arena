'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The countdown.
 *
 * It is the largest object on the question screen because time pressure is the
 * product. Three states escalate: chalk above 66% of the window, BLAZE between
 * 33% and 66%, LOSS below 33% with a one-second pulse.
 *
 * Accessibility: the digits are `aria-hidden` (a per-second live region would
 * flood a screen reader). Instead a polite announcement fires once at 10s and
 * once at 5s.
 */
export function ArenaClock({
  msRemaining,
  totalMs,
  paused = false,
  className,
}: {
  msRemaining: number;
  totalMs: number;
  paused?: boolean;
  className?: string;
}) {
  const seconds = Math.ceil(msRemaining / 1000);
  const ratio = totalMs > 0 ? Math.max(0, Math.min(1, msRemaining / totalMs)) : 0;

  const phase = paused ? 'paused' : ratio > 0.66 ? 'calm' : ratio > 0.33 ? 'warm' : 'critical';

  const tone = {
    calm: 'text-chalk',
    warm: 'text-blaze',
    critical: 'text-loss',
    paused: 'text-ghost',
  }[phase];

  const announcement = useTimerAnnouncement(seconds, paused);

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <span
        aria-hidden
        className={cn(
          'numeral text-[clamp(4.5rem,24vw,7rem)] transition-colors duration-300',
          tone,
          phase === 'critical' && 'animate-critical-pulse',
        )}
      >
        {paused ? '--' : String(Math.max(0, seconds)).padStart(2, '0')}
      </span>
      <span
        className={cn(
          'mt-1 font-data text-kicker uppercase transition-colors',
          phase === 'critical' ? 'text-loss' : 'text-smoke',
        )}
      >
        {paused ? 'Paused' : seconds === 1 ? 'Second' : 'Seconds'}
      </span>

      {/* Polite, infrequent announcements rather than a per-second firehose. */}
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}

function useTimerAnnouncement(seconds: number, paused: boolean) {
  const [message, setMessage] = React.useState('');
  const announced = React.useRef<Set<number>>(new Set());

  React.useEffect(() => {
    if (paused) return;
    for (const mark of [10, 5]) {
      if (seconds === mark && !announced.current.has(mark)) {
        announced.current.add(mark);
        setMessage(`${mark} seconds remaining`);
      }
    }
    if (seconds <= 0 && !announced.current.has(0)) {
      announced.current.add(0);
      setMessage('Time is up');
    }
  }, [seconds, paused]);

  return message;
}

/**
 * Thin progress rail for the question window, pinned under the status strip.
 * It drains left to right and changes colour with the same three phases.
 */
export function ClockRail({
  msRemaining,
  totalMs,
  paused = false,
  className,
}: {
  msRemaining: number;
  totalMs: number;
  paused?: boolean;
  className?: string;
}) {
  const ratio = totalMs > 0 ? Math.max(0, Math.min(1, msRemaining / totalMs)) : 0;
  const tone = paused
    ? 'bg-ghost'
    : ratio > 0.66
      ? 'bg-volt'
      : ratio > 0.33
        ? 'bg-blaze'
        : 'bg-loss';

  return (
    <div className={cn('h-1 w-full overflow-hidden bg-ridge', className)} aria-hidden>
      <div
        className={cn('h-full transition-[width] duration-100 ease-linear', tone)}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}

/** Compact clock for the host console, where the stage belongs to the stats. */
export function ClockChip({
  msRemaining,
  totalMs,
  paused,
  className,
}: {
  msRemaining: number;
  totalMs: number;
  paused?: boolean;
  className?: string;
}) {
  const seconds = Math.ceil(msRemaining / 1000);
  const ratio = totalMs > 0 ? Math.max(0, Math.min(1, msRemaining / totalMs)) : 0;
  const tone = paused
    ? 'text-ghost'
    : ratio > 0.66
      ? 'text-chalk'
      : ratio > 0.33
        ? 'text-blaze'
        : 'text-loss';

  return (
    <div className={cn('flex items-baseline gap-2', className)}>
      <span className={cn('numeral text-[2.5rem]', tone)}>
        {paused ? '--' : String(Math.max(0, seconds)).padStart(2, '0')}
      </span>
      <span className="font-data text-kicker text-smoke">sec</span>
    </div>
  );
}
