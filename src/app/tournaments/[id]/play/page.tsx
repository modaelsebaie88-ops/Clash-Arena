'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Display,
  ErrorState,
  Kicker,
  LoadingState,
  RoundPips,
  Tag,
} from '@/components/ui/primitives';
import { AnswerDeck } from '@/components/tournament/answer-deck';
import { ArenaClock, ClockRail } from '@/components/tournament/timer';
import { RankingsPeek } from '@/components/tournament/rankings';
import { RoundRecap } from '@/components/tournament/reveal';
import { SignalDot } from '@/components/tournament/poster';
import { ApiClientError, api, fetcher } from '@/lib/client/api';
import { useCountdown, useSession } from '@/lib/client/hooks';
import { useSocketEvent, useTournamentSocket } from '@/lib/client/socket';
import { cn } from '@/lib/utils';
import type {
  AnswerPayload,
  LeaderboardDTO,
  LiveTournamentStateDTO,
  QuestionResultDTO,
} from '@/types';

type Phase = 'connecting' | 'standby' | 'question' | 'recap' | 'over';

/**
 * The arena floor.
 *
 * One job at a time: read, think, answer, lock in. Navigation is hidden, the
 * clock is the largest object on screen, and the player's rank is deliberately
 * absent while a question is open (it is a distraction, and the product rule
 * forbids it). Everything arrives over the websocket.
 */
export default function ArenaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSession();

  const { data: initial } = useSWR<{ state: LiveTournamentStateDTO }>(
    `/api/tournaments/${params.id}/state`,
    fetcher,
  );

  const [state, setState] = React.useState<LiveTournamentStateDTO | null>(null);
  const [submitted, setSubmitted] = React.useState(false);
  const [summary, setSummary] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<QuestionResultDTO | null>(null);
  const [board, setBoard] = React.useState<LeaderboardDTO | null>(null);
  const [phase, setPhase] = React.useState<Phase>('connecting');

  const applyState = React.useCallback((next: LiveTournamentStateDTO) => {
    setState(next);

    if (next.status === 'FINISHED' || next.status === 'ARCHIVED') {
      setPhase('over');
      return;
    }
    if (next.currentQuestion) {
      setSubmitted(Boolean(next.mySubmission));
      setSummary(next.mySubmission?.answerSummary ?? null);
      setPhase('question');
    } else {
      setPhase((current) => (current === 'recap' ? 'recap' : 'standby'));
    }
  }, []);

  const { socket, connected, clockOffsetMs, error } = useTournamentSocket(params.id, {
    onState: applyState,
  });

  React.useEffect(() => {
    if (initial?.state && !state) applyState(initial.state);
  }, [initial, state, applyState]);

  /* ---- realtime ---------------------------------------------------- */

  useSocketEvent(socket, 'question:started', (payload) => {
    setResult(null);
    setSubmitted(false);
    setSummary(null);
    setState((previous) =>
      previous
        ? {
            ...previous,
            status: 'LIVE',
            currentQuestion: payload.question,
            currentQuestionIndex: payload.question.index,
            mySubmission: null,
          }
        : previous,
    );
    setPhase('question');
  });

  useSocketEvent(socket, 'question:submissionAck', () => setSubmitted(true));

  useSocketEvent(socket, 'question:ended', (payload) => {
    if (payload.leaderboard.entries.length) setBoard(payload.leaderboard);
    setState((previous) => (previous ? { ...previous, currentQuestion: null } : previous));
    setPhase('recap');
  });

  useSocketEvent(socket, 'question:result', (payload) => {
    setResult(payload);
    setPhase('recap');
  });

  useSocketEvent(socket, 'leaderboard:updated', (payload) => {
    if (payload.entries.length) setBoard(payload);
  });

  useSocketEvent(socket, 'tournament:paused', () => {
    toast('The host paused the round');
    setState((previous) => (previous ? { ...previous, status: 'PAUSED' } : previous));
  });

  useSocketEvent(socket, 'tournament:resumed', (payload) => {
    toast.success('Back on');
    setState((previous) =>
      previous
        ? {
            ...previous,
            status: 'LIVE',
            currentQuestion:
              previous.currentQuestion && payload.endsAt
                ? { ...previous.currentQuestion, endsAt: payload.endsAt }
                : previous.currentQuestion,
          }
        : previous,
    );
  });

  useSocketEvent(socket, 'tournament:ended', () => {
    setPhase('over');
    window.setTimeout(() => router.push(`/tournaments/${params.id}/result`), 1400);
  });

  useSocketEvent(socket, 'badge:earned', (payload) => {
    toast.success(`${payload.badge.icon} ${payload.badge.name}`, {
      description: payload.badge.description,
    });
  });

  useSocketEvent(socket, 'server:error', (payload) => toast.error(payload.message));

  /* ---- timing ------------------------------------------------------ */

  const question = state?.currentQuestion ?? null;
  const paused = state?.status === 'PAUSED';
  const countdown = useCountdown(question?.endsAt ?? null, clockOffsetMs, { paused });
  const totalMs = (question?.timeLimitSeconds ?? 0) * 1000;

  const submit = async (answer: AnswerPayload) => {
    if (!question) return;
    try {
      await api.post(`/api/questions/${question.id}/submit`, answer);
      setSubmitted(true);
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : 'That did not go through.';
      toast.error(message);
      // A duplicate means the server already holds an answer: reflect the truth.
      if (err instanceof ApiClientError && err.code === 'CONFLICT') setSubmitted(true);
      throw err;
    }
  };

  /* ---- tournament over --------------------------------------------- */

  if (phase === 'over') {
    return (
      <Stage>
        <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-6 text-center">
          <Display size="xl">That&apos;s the whistle</Display>
          <Kicker>Calculating the final rankings</Kicker>
          <Link href={`/tournaments/${params.id}/result`}>
            <Button size="lg">See the podium</Button>
          </Link>
        </div>
      </Stage>
    );
  }

  const roundIndex = question?.index ?? state?.currentQuestionIndex ?? 0;
  const roundTotal = question?.totalQuestions ?? state?.questionCount ?? 0;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-ink">
      {/* --- status strip ------------------------------------------- */}
      <header className="sticky top-0 z-40 border-b border-rail bg-ink/95 backdrop-blur-md">
        <div className="container flex h-12 items-center justify-between gap-3">
          <Link
            href={`/tournaments/${params.id}`}
            aria-label="Leave the arena"
            className="-ml-2 grid h-10 w-10 place-items-center rounded-sm text-ghost transition-colors hover:text-chalk"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>

          <div className="min-w-0 text-center">
            <p className="truncate font-data text-[11px] font-bold uppercase tracking-[0.12em] text-smoke">
              {state?.name ?? 'Arena'}
            </p>
            {roundTotal > 0 ? (
              <p className="font-data text-[10px] uppercase tracking-[0.14em] text-ghost tnum">
                Round {String(roundIndex).padStart(2, '0')} / {roundTotal}
              </p>
            ) : null}
          </div>

          <div className="flex w-10 justify-end">
            {paused ? <Tag tone="flag">Hold</Tag> : <SignalDot connected={connected} />}
          </div>
        </div>

        {roundTotal > 0 ? (
          <div className="container pb-2">
            <RoundPips total={roundTotal} current={Math.max(1, roundIndex)} />
          </div>
        ) : null}

        {phase === 'question' && question ? (
          <ClockRail msRemaining={countdown.msRemaining} totalMs={totalMs} paused={paused} />
        ) : null}
      </header>

      <main className="container flex-1 py-6">
        <AnimatePresence mode="wait">
          {/* --- connecting ---------------------------------------- */}
          {phase === 'connecting' ? (
            <motion.div key="connecting" exit={{ opacity: 0 }}>
              {error ? (
                <ErrorState
                  title="Connection interrupted"
                  description="We are reconnecting you to the arena. Your progress is safe."
                />
              ) : (
                <LoadingState message="Syncing with the tournament" />
              )}
            </motion.div>
          ) : null}

          {/* --- between rounds ------------------------------------- */}
          {phase === 'standby' ? (
            <motion.div
              key="standby"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex min-h-[60dvh] flex-col items-center justify-center gap-6 text-center"
            >
              <Display size="xl">Stand by</Display>
              <div className="flex gap-2" aria-hidden>
                {[0, 1, 2].map((index) => (
                  <motion.span
                    key={index}
                    className="h-2 w-2 rounded-full bg-volt"
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: index * 0.16 }}
                  />
                ))}
              </div>
              <Kicker aria-live="polite">The host starts the next round</Kicker>

              {board?.entries.length ? (
                <div className="w-full max-w-md pt-6">
                  <Kicker className="mb-3">The rankings</Kicker>
                  <RankingsPeek entries={board.entries} youUserId={user?.id ?? null} />
                </div>
              ) : null}
            </motion.div>
          ) : null}

          {/* --- live question -------------------------------------- */}
          {phase === 'question' && question ? (
            <motion.div
              key={`q-${question.id}`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="mx-auto max-w-2xl"
            >
              <div className="flex flex-col items-center">
                <ArenaClock
                  msRemaining={countdown.msRemaining}
                  totalMs={totalMs}
                  paused={paused}
                />

                <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                  <Tag tone="volt">{question.basePoints} pts</Tag>
                  {question.speedBonusPoints > 0 ? (
                    <Tag tone="blaze">+{question.speedBonusPoints} speed</Tag>
                  ) : null}
                  {question.requiresManualGrading ? <Tag tone="flag">Host scored</Tag> : null}
                </div>
              </div>

              <h1 className="mt-7 text-balance text-center text-[clamp(1.375rem,6vw,2rem)] font-semibold leading-[1.15] text-chalk">
                {question.prompt}
              </h1>

              {question.imageUrl ? (
                <img
                  src={question.imageUrl}
                  alt=""
                  className="mx-auto mt-5 max-h-64 rounded-md border border-rail object-contain"
                />
              ) : null}

              <div className="mt-7">
                <AnswerDeck
                  question={question}
                  onSubmit={submit}
                  submitted={submitted}
                  submittedSummary={summary}
                  locked={paused || countdown.expired}
                />
              </div>

              {countdown.expired && !submitted ? (
                <p className="mt-5 text-center font-data text-[13px] font-extrabold uppercase tracking-[0.12em] text-loss">
                  Time&apos;s up
                </p>
              ) : null}

              {paused ? (
                <p className="mt-5 text-center font-data text-[12px] uppercase tracking-[0.12em] text-flag">
                  The host paused the clock
                </p>
              ) : null}
            </motion.div>
          ) : null}

          {/* --- round recap ---------------------------------------- */}
          {phase === 'recap' ? (
            <motion.div
              key="recap"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mx-auto max-w-2xl space-y-6"
            >
              {result ? (
                <RoundRecap result={result} />
              ) : (
                <LoadingState message="Calculating the rankings" />
              )}

              {board?.entries.length ? (
                <section>
                  <Kicker className="mb-3">The rankings</Kicker>
                  <RankingsPeek
                    entries={board.entries}
                    youUserId={user?.id ?? null}
                    topCount={8}
                  />
                </section>
              ) : null}

              <p className="pb-4 text-center font-data text-[11px] uppercase tracking-[0.14em] text-ghost">
                Next round when the host is ready
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>
    </div>
  );
}

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn('flex min-h-[100dvh] flex-col bg-ink')}>
      <main className="container flex-1 py-6">{children}</main>
    </div>
  );
}
