'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Clock, Hourglass, X } from 'lucide-react';
import { CountUp } from '@/components/ui/count-up';
import { Kicker, Numeral, Tag } from '@/components/ui/primitives';
import { cn, formatMs, ordinal } from '@/lib/utils';
import type { QuestionResultDTO } from '@/types';

const SPRING = { type: 'spring' as const, stiffness: 320, damping: 26 };

const VERDICT = {
  CORRECT: {
    headline: 'Correct',
    glyph: Check,
    text: 'text-win',
    chip: 'bg-win text-volt-ink',
    edge: 'border-win',
    wash: 'bg-win/10',
  },
  PARTIAL: {
    headline: 'Partial',
    glyph: Check,
    text: 'text-flag',
    chip: 'bg-flag text-volt-ink',
    edge: 'border-flag',
    wash: 'bg-flag/10',
  },
  INCORRECT: {
    headline: 'Not this time',
    glyph: X,
    text: 'text-loss',
    chip: 'bg-loss text-chalk',
    edge: 'border-loss',
    wash: 'bg-loss/10',
  },
  NO_ANSWER: {
    headline: "Time's up",
    glyph: Clock,
    text: 'text-ghost',
    chip: 'bg-ridge text-smoke',
    edge: 'border-rail',
    wash: 'bg-deck',
  },
  PENDING: {
    headline: 'With the host',
    glyph: Hourglass,
    text: 'text-volt',
    chip: 'bg-volt text-volt-ink',
    edge: 'border-volt',
    wash: 'bg-volt/10',
  },
} as const;

/**
 * Two-beat reveal.
 *
 * Beat one is the verdict alone, full-bleed, for a moment - that pause is what
 * makes the result land. Beat two is the recap with rank movement and stats.
 * Under reduced motion both beats collapse into the recap immediately.
 */
export function RoundRecap({
  result,
  roundLabel,
  className,
}: {
  result: QuestionResultDTO;
  roundLabel?: string;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = React.useState<'verdict' | 'recap'>(reduced ? 'recap' : 'verdict');

  React.useEffect(() => {
    if (reduced) {
      setPhase('recap');
      return;
    }
    setPhase('verdict');
    const id = window.setTimeout(() => setPhase('recap'), 1500);
    return () => window.clearTimeout(id);
  }, [result.questionId, reduced]);

  const meta = VERDICT[result.outcome] ?? VERDICT.PENDING;
  const Glyph = meta.glyph;
  const climbed = result.rankDelta ?? 0;

  return (
    <div className={cn('relative', className)}>
      <AnimatePresence mode="wait">
        {phase === 'verdict' ? (
          <motion.div
            key="verdict"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.04 }}
            transition={SPRING}
            className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center"
          >
            <motion.span
              initial={{ scale: 0.3, rotate: -18 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 15 }}
              className={cn('grid h-24 w-24 place-items-center rounded-lg', meta.chip)}
            >
              <Glyph className="h-14 w-14" strokeWidth={3.5} />
            </motion.span>

            <h2 className={cn('display text-[clamp(2.75rem,14vw,4.5rem)] leading-none', meta.text)}>
              {meta.headline}
            </h2>

            {result.outcome !== 'PENDING' ? (
              <p className="numeral text-[clamp(3rem,18vw,5rem)] text-chalk">
                <CountUp to={result.awardedPoints} prefix={result.awardedPoints > 0 ? '+' : ''} />
              </p>
            ) : null}
          </motion.div>
        ) : (
          <motion.div
            key="recap"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            className="space-y-4"
          >
            {/* Verdict header, now compact */}
            <div className={cn('flex items-center gap-4 rounded-md border-2 p-4', meta.edge, meta.wash)}>
              <span className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-sm', meta.chip)}>
                <Glyph className="h-7 w-7" strokeWidth={3.5} />
              </span>
              <div className="min-w-0 flex-1">
                <Kicker>{roundLabel ?? `Round ${String(result.questionIndex).padStart(2, '0')}`}</Kicker>
                <p className={cn('display mt-0.5 text-[1.5rem] leading-none', meta.text)}>
                  {meta.headline}
                </p>
              </div>
              <div className="text-right">
                <p className="numeral text-[2rem] text-chalk">
                  <CountUp
                    to={result.awardedPoints}
                    prefix={result.awardedPoints > 0 ? '+' : ''}
                    durationMs={500}
                  />
                </p>
                <Kicker>Points</Kicker>
              </div>
            </div>

            {result.speedBonus > 0 ? (
              <div className="flex items-center justify-center gap-2">
                <Tag tone="blaze">Speed bonus +{result.speedBonus}</Tag>
                {result.currentStreak >= 2 ? (
                  <Tag tone="blaze">{result.currentStreak} streak</Tag>
                ) : null}
              </div>
            ) : null}

            {/* Rank movement: the reason to keep playing */}
            {result.rank !== null ? (
              <div className="rounded-md border border-rail bg-deck p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-center">
                    <Kicker>Was</Kicker>
                    <p className="numeral mt-1 text-[1.75rem] text-ghost">
                      {result.previousRank ? `#${result.previousRank}` : '—'}
                    </p>
                  </div>

                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.2, duration: 0.4 }}
                    className="h-px flex-1 origin-left bg-rail"
                  />

                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35, ...SPRING }}
                    className="text-center"
                  >
                    <Kicker tone="volt">Now</Kicker>
                    <p className="numeral mt-1 text-[2.75rem] text-volt">#{result.rank}</p>
                  </motion.div>
                </div>

                {result.previousRank !== null ? (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className={cn(
                      'mt-4 text-center font-data text-[13px] font-extrabold uppercase tracking-[0.12em]',
                      climbed > 0 ? 'text-win' : climbed < 0 ? 'text-loss' : 'text-ghost',
                    )}
                  >
                    {climbed > 0
                      ? `▲ You climbed ${climbed} ${climbed === 1 ? 'place' : 'places'}`
                      : climbed < 0
                        ? `▼ You dropped ${Math.abs(climbed)}`
                        : `Holding ${ordinal(result.rank)}`}
                  </motion.p>
                ) : null}
              </div>
            ) : null}

            {/* Round stats */}
            <div className="grid grid-cols-3 divide-x divide-rail overflow-hidden rounded-md border border-rail bg-deck">
              <div className="px-3 py-3">
                <Numeral
                  value={result.responseTimeMs === null ? '—' : formatMs(result.responseTimeMs)}
                  label="Your time"
                  size="md"
                />
              </div>
              <div className="px-3 py-3">
                <Numeral value={result.totalPoints} label="Total" size="md" tone="volt" />
              </div>
              <div className="px-3 py-3">
                <Numeral
                  value={result.currentStreak}
                  label="Streak"
                  size="md"
                  tone={result.currentStreak >= 3 ? 'blaze' : 'chalk'}
                />
              </div>
            </div>

            {/* What the right answer was */}
            {result.reveal && result.outcome !== 'CORRECT' && result.reveal.correctAnswerText ? (
              <div className="rounded-md border border-rail bg-pit p-4">
                <Kicker tone="chalk">Correct answer</Kicker>
                <p className="mt-1.5 font-data text-[16px] font-bold text-win">
                  {result.reveal.correctAnswerText}
                </p>
                {result.reveal.explanation ? (
                  <p className="mt-2 text-[13px] leading-relaxed text-smoke">
                    {result.reveal.explanation}
                  </p>
                ) : null}
              </div>
            ) : null}

            {result.awaitingReview ? (
              <div className="rounded-md border border-volt/40 bg-volt/5 p-4 text-center">
                <Kicker tone="volt">Under review</Kicker>
                <p className="mt-1.5 text-[13px] leading-relaxed text-smoke">
                  The host is scoring your written solution. Points appear on the board as soon as
                  they finish.
                </p>
              </div>
            ) : null}

            {result.badges.length ? <BadgeDrop badges={result.badges} /> : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Badges land one after another so each one registers. */
export function BadgeDrop({ badges }: { badges: QuestionResultDTO['badges'] }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {badges.map((badge, index) => (
        <motion.span
          key={badge.code}
          initial={{ scale: 0.4, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ delay: 0.2 + index * 0.14, type: 'spring', stiffness: 420, damping: 16 }}
          className="inline-flex items-center gap-2 rounded-sm border px-3 py-2"
          style={{
            borderColor: `${badge.color}66`,
            background: `${badge.color}14`,
          }}
        >
          <span aria-hidden className="text-[16px]">
            {badge.icon}
          </span>
          <span
            className="font-data text-[11px] font-black uppercase tracking-[0.12em]"
            style={{ color: badge.color }}
          >
            {badge.name}
          </span>
        </motion.span>
      ))}
    </div>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);
  return reduced;
}
