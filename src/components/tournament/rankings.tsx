'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Avatar, EmptyState, Kicker } from '@/components/ui/primitives';
import { cn, formatMs, formatNumber } from '@/lib/utils';
import type { LeaderboardEntryDTO } from '@/types';

const SPRING = { type: 'spring' as const, stiffness: 320, damping: 30 };

/* ------------------------------------------------------------------ *
 * Rank movement
 * ------------------------------------------------------------------ */

export function Movement({ delta, className }: { delta: number | null; className?: string }) {
  if (delta === null) {
    return (
      <span className={cn('font-data text-[10px] font-bold uppercase tracking-[0.12em] text-ghost', className)}>
        New
      </span>
    );
  }
  if (delta === 0) {
    return (
      <span className={cn('font-data text-[11px] font-bold text-ghost', className)} title="No change">
        —
      </span>
    );
  }

  const up = delta > 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-data text-[12px] font-extrabold tnum',
        up ? 'text-win' : 'text-loss',
        className,
      )}
      title={up ? `Up ${delta}` : `Down ${Math.abs(delta)}`}
    >
      <span aria-hidden>{up ? '▲' : '▼'}</span>
      {Math.abs(delta)}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Podium
 * ------------------------------------------------------------------ */

const PLACES = [
  { rank: 2, metal: 'silver', height: 'h-20', label: '2ND', delay: 0.12 },
  { rank: 1, metal: 'gold', height: 'h-28', label: '1ST', delay: 0 },
  { rank: 3, metal: 'bronze', height: 'h-14', label: '3RD', delay: 0.24 },
] as const;

export function Podium({
  entries,
  className,
}: {
  entries: LeaderboardEntryDTO[];
  className?: string;
}) {
  if (!entries.length) return null;
  const byRank = new Map(entries.map((entry) => [entry.rank, entry] as const));

  return (
    <div className={cn('flex items-end justify-center gap-2 sm:gap-4', className)}>
      {PLACES.map((place) => {
        const entry = byRank.get(place.rank);
        if (!entry) return <div key={place.rank} className="w-[30%] max-w-[8rem]" />;

        const metalText = {
          gold: 'text-gold',
          silver: 'text-silver',
          bronze: 'text-bronze',
        }[place.metal];
        const metalBorder = {
          gold: 'border-gold/50',
          silver: 'border-silver/40',
          bronze: 'border-bronze/40',
        }[place.metal];

        return (
          <motion.div
            key={place.rank}
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: place.delay }}
            className="flex w-[30%] max-w-[9rem] flex-col items-center"
          >
            <Avatar
              name={entry.displayName}
              src={entry.avatarUrl}
              size={place.rank === 1 ? 60 : 48}
              ring={place.metal}
            />
            <p className="mt-2 line-clamp-1 text-center font-data text-[13px] font-bold text-chalk">
              {entry.displayName}
            </p>
            <p className={cn('numeral mt-0.5 text-[1.25rem]', metalText)}>
              {formatNumber(entry.totalPoints)}
            </p>

            <div
              className={cn(
                'mt-3 flex w-full items-start justify-center border-x border-t bg-deck pt-2',
                metalBorder,
                place.height,
              )}
            >
              <span className={cn('display text-[1.125rem] leading-none', metalText)}>
                {place.label}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Scoreboard
 * ------------------------------------------------------------------ */

export function ScoreboardRow({
  entry,
  isYou,
  showMovement = true,
  compact = false,
}: {
  entry: LeaderboardEntryDTO;
  isYou?: boolean;
  showMovement?: boolean;
  compact?: boolean;
}) {
  const metal =
    entry.rank === 1 ? 'text-gold' : entry.rank === 2 ? 'text-silver' : entry.rank === 3 ? 'text-bronze' : 'text-ghost';

  return (
    <motion.div
      layout
      layoutId={entry.participantId}
      transition={SPRING}
      className={cn(
        'relative flex items-center gap-3 border-b border-rail bg-deck px-4',
        compact ? 'min-h-[56px] py-2' : 'min-h-[64px] py-2.5',
        isYou && 'bg-volt/5',
        entry.status === 'DISQUALIFIED' && 'opacity-45',
      )}
    >
      {isYou ? <span className="absolute inset-y-0 left-0 w-[3px] bg-volt" aria-hidden /> : null}

      <span className={cn('numeral w-8 shrink-0 text-[1.125rem]', isYou ? 'text-volt' : metal)}>
        {entry.rank}
      </span>

      <Avatar
        name={entry.displayName}
        src={entry.avatarUrl}
        size={compact ? 32 : 36}
        ring={entry.rank <= 3 ? (['gold', 'silver', 'bronze'] as const)[entry.rank - 1] : null}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-data text-[14px] font-bold text-chalk">
            {entry.displayName}
          </p>
          {isYou ? (
            <span className="shrink-0 rounded-xs bg-volt px-1.5 py-0.5 font-data text-[9px] font-black uppercase tracking-[0.1em] text-volt-ink">
              You
            </span>
          ) : null}
          {entry.currentStreak >= 3 ? (
            <span className="shrink-0 font-data text-[11px] font-bold text-blaze" title={`${entry.currentStreak} streak`}>
              ▲{entry.currentStreak}
            </span>
          ) : null}
        </div>
        {!compact ? (
          <p className="mt-0.5 font-data text-[11px] uppercase tracking-[0.08em] text-ghost tnum">
            {entry.correctCount} correct · {formatMs(entry.averageResponseMs)} avg
            {entry.status === 'DISQUALIFIED' ? ' · removed' : ''}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end">
        <span className={cn('numeral text-[1.25rem]', isYou ? 'text-volt' : 'text-chalk')}>
          {formatNumber(entry.totalPoints)}
        </span>
        {showMovement ? <Movement delta={entry.rankDelta} className="mt-0.5" /> : null}
      </div>
    </motion.div>
  );
}

export function Rankings({
  entries,
  youUserId,
  showMovement = true,
  compact = false,
  emptyTitle = 'No scores yet',
  emptyDescription = 'The board fills the moment the first round closes.',
  className,
}: {
  entries: LeaderboardEntryDTO[];
  youUserId?: string | null;
  showMovement?: boolean;
  compact?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}) {
  if (!entries.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className={cn('overflow-hidden border-y border-rail sm:rounded-md sm:border-x', className)}>
      <AnimatePresence initial={false}>
        {entries.map((entry) => (
          <ScoreboardRow
            key={entry.participantId}
            entry={entry}
            isYou={entry.userId === youUserId}
            showMovement={showMovement}
            compact={compact}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

/**
 * Full board with the viewer pinned.
 *
 * If your row scrolls out of view it reappears docked at the bottom, so you can
 * never lose track of where you stand - the thing players actually care about.
 */
export function RankingsWithYou({
  entries,
  youUserId,
  showMovement = true,
  className,
}: {
  entries: LeaderboardEntryDTO[];
  youUserId: string | null;
  showMovement?: boolean;
  className?: string;
}) {
  const yourRowRef = React.useRef<HTMLDivElement>(null);
  const [docked, setDocked] = React.useState(false);

  const you = entries.find((entry) => entry.userId === youUserId) ?? null;

  React.useEffect(() => {
    const node = yourRowRef.current;
    if (!node || !you) return;

    const observer = new IntersectionObserver(
      ([record]) => setDocked(!record.isIntersecting),
      { rootMargin: '-72px 0px -96px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [you]);

  return (
    <div className={className}>
      <div className="overflow-hidden border-y border-rail sm:rounded-md sm:border-x">
        <AnimatePresence initial={false}>
          {entries.map((entry) => {
            const isYou = entry.userId === youUserId;
            return (
              <div key={entry.participantId} ref={isYou ? yourRowRef : undefined}>
                <ScoreboardRow entry={entry} isYou={isYou} showMovement={showMovement} />
              </div>
            );
          })}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {docked && you ? (
          <motion.div
            initial={{ y: 80 }}
            animate={{ y: 0 }}
            exit={{ y: 80 }}
            transition={SPRING}
            className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-volt bg-pit/95 pb-safe backdrop-blur-md md:bottom-4 md:left-1/2 md:w-[min(42rem,calc(100vw-4rem))] md:-translate-x-1/2 md:rounded-md md:border md:pb-0"
          >
            <div className="mx-auto max-w-3xl">
              <ScoreboardRow entry={you} isYou showMovement={showMovement} compact />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Top slice plus your own row, used beside a live round. */
export function RankingsPeek({
  entries,
  youUserId,
  topCount = 5,
  className,
}: {
  entries: LeaderboardEntryDTO[];
  youUserId: string | null;
  topCount?: number;
  className?: string;
}) {
  const top = entries.slice(0, topCount);
  const you = entries.find((entry) => entry.userId === youUserId);
  const outside = you && !top.some((entry) => entry.userId === youUserId);

  return (
    <div className={cn('overflow-hidden border-y border-rail sm:rounded-md sm:border-x', className)}>
      {top.map((entry) => (
        <ScoreboardRow
          key={entry.participantId}
          entry={entry}
          isYou={entry.userId === youUserId}
          compact
        />
      ))}
      {outside && you ? (
        <>
          <div className="flex items-center justify-center bg-pit py-1.5">
            <Kicker className="text-ghost">· · ·</Kicker>
          </div>
          <ScoreboardRow entry={you} isYou compact />
        </>
      ) : null}
    </div>
  );
}
