'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { Check, DoorOpen, Flag, Pause, Play, Radio, SkipForward, Square } from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell, TournamentTabs } from '@/components/admin/admin-shell';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import {
  Display,
  Kicker,
  LiveTag,
  LoadingState,
  Meter,
  Numeral,
  RoundPips,
  Tag,
} from '@/components/ui/primitives';
import { ClockChip } from '@/components/tournament/timer';
import { Rankings } from '@/components/tournament/rankings';
import { CodePlate, SignalDot, StatusTag } from '@/components/tournament/poster';
import { ApiClientError, api, fetcher } from '@/lib/client/api';
import { useCountdown } from '@/lib/client/hooks';
import { useSocketEvent, useTournamentSocket } from '@/lib/client/socket';
import { cn, formatMs, formatPercent } from '@/lib/utils';
import type {
  LeaderboardDTO,
  LiveTournamentStateDTO,
  QuestionRevealDTO,
  QuestionStatsDTO,
} from '@/types';
import type { AdminQuestion } from '@/components/admin/question-builder';

/**
 * The control room.
 *
 * Everything the host needs while a room full of people is waiting on them:
 * the clock, who has answered, what the right answer is, and four unmistakable
 * controls. The leaderboard sits in a persistent rail on wide screens.
 */
export default function ControlRoomPage() {
  const params = useParams<{ id: string }>();

  const { data: initial, mutate: refreshState } = useSWR<{ state: LiveTournamentStateDTO }>(
    `/api/tournaments/${params.id}/state`,
    fetcher,
    { refreshInterval: 8_000 },
  );
  const { data: questionData, mutate: refreshQuestions } = useSWR<{ questions: AdminQuestion[] }>(
    `/api/tournaments/${params.id}/questions`,
    fetcher,
  );
  const { data: boardData, mutate: refreshBoard } = useSWR<LeaderboardDTO>(
    `/api/tournaments/${params.id}/leaderboard?limit=30`,
    fetcher,
  );

  const [state, setState] = React.useState<LiveTournamentStateDTO | null>(null);
  const [stats, setStats] = React.useState<QuestionStatsDTO | null>(null);
  const [reveal, setReveal] = React.useState<QuestionRevealDTO | null>(null);
  const [board, setBoard] = React.useState<LeaderboardDTO | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = React.useState(false);

  const { socket, connected } = useTournamentSocket(params.id, { onState: setState });

  const live = state ?? initial?.state ?? null;
  const questions = questionData?.questions ?? [];
  const leaderboard = board ?? boardData ?? null;

  useSocketEvent(socket, 'question:started', (payload) => {
    setReveal(null);
    setStats(null);
    setState((previous) =>
      previous
        ? {
            ...previous,
            status: 'LIVE',
            currentQuestion: payload.question,
            currentQuestionIndex: payload.question.index,
          }
        : previous,
    );
    void refreshQuestions();
  });

  useSocketEvent(socket, 'question:stats', setStats);

  useSocketEvent(socket, 'question:ended', (payload) => {
    setStats(payload.stats);
    setReveal(payload.reveal);
    setBoard(payload.leaderboard);
    setState((previous) => (previous ? { ...previous, currentQuestion: null } : previous));
    void refreshQuestions();
  });

  useSocketEvent(socket, 'leaderboard:updated', setBoard);

  useSocketEvent(socket, 'presence:update', (payload) => {
    setState((previous) =>
      previous ? { ...previous, connectedCount: payload.connectedCount } : previous,
    );
  });

  useSocketEvent(socket, 'tournament:ended', (payload) => {
    setBoard(payload.leaderboard);
    setState((previous) =>
      previous ? { ...previous, status: 'FINISHED', currentQuestion: null } : previous,
    );
    toast.success('Tournament complete');
  });

  const question = live?.currentQuestion ?? null;
  const paused = live?.status === 'PAUSED';
  const countdown = useCountdown(question?.endsAt ?? null, 0, { paused });

  const run = async (label: string, path: string, success: string) => {
    setBusy(label);
    try {
      await api.post(`/api/tournaments/${params.id}/${path}`);
      await Promise.all([refreshState(), refreshBoard(), refreshQuestions()]);
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'That action failed.');
    } finally {
      setBusy(null);
    }
  };

  if (!live) {
    return (
      <AdminShell title="Control" tabs={<TournamentTabs tournamentId={params.id} />} wide>
        <LoadingState message="Connecting to the arena" />
      </AdminShell>
    );
  }

  const played = questions.filter((row) => row.status === 'CLOSED').length;
  const currentAdminQuestion = question
    ? questions.find((row) => row.id === question.id)
    : reveal
      ? questions.find((row) => row.id === reveal.questionId)
      : null;

  const isLive = live.status === 'LIVE' || live.status === 'PAUSED';
  const notStarted = ['DRAFT', 'REGISTRATION_OPEN', 'WAITING'].includes(live.status);
  const finished = live.status === 'FINISHED' || live.status === 'ARCHIVED';

  const submitted = stats?.submitted ?? 0;
  const eligible = stats?.eligible ?? live.participantCount;
  const waiting = stats?.waiting ?? Math.max(0, eligible - submitted);
  const submitRate = eligible > 0 ? (submitted / eligible) * 100 : 0;

  return (
    <AdminShell
      kicker={live.name}
      title="Control room"
      live={isLive}
      wide
      tabs={<TournamentTabs tournamentId={params.id} />}
      actions={
        <div className="flex items-center gap-2">
          {isLive ? <LiveTag /> : <StatusTag status={live.status} />}
          <CodePlate code={live.code} size="sm" />
          <SignalDot connected={connected} />
        </div>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* ---------------- stage ---------------- */}
        <div className="space-y-4">
          {/* Round status */}
          <div
            className={cn(
              'relative overflow-hidden rounded-lg border bg-deck p-5',
              isLive ? 'border-loss/40' : 'border-rail',
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Kicker tone={question ? 'volt' : 'smoke'}>
                  {question
                    ? 'Question open'
                    : finished
                      ? 'Tournament complete'
                      : notStarted
                        ? 'Not started'
                        : 'Between rounds'}
                </Kicker>
                <Display size="lg" className="mt-1">
                  {questions.length
                    ? `Round ${String(question?.index ?? played).padStart(2, '0')} / ${questions.length}`
                    : 'No rounds yet'}
                </Display>
              </div>

              {question ? (
                <ClockChip
                  msRemaining={countdown.msRemaining}
                  totalMs={question.timeLimitSeconds * 1000}
                  paused={paused}
                />
              ) : null}
            </div>

            {questions.length ? (
              <RoundPips
                total={questions.length}
                current={Math.max(1, question?.index ?? played)}
                className="mt-5"
              />
            ) : null}

            {question ? (
              <div className="mt-5 rounded-md border border-rail bg-pit p-4">
                <p className="text-[16px] font-semibold leading-snug text-chalk">
                  {question.prompt}
                </p>

                {currentAdminQuestion?.options.length ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {currentAdminQuestion.options.map((option, index) => (
                      <div
                        key={option.id}
                        className={cn(
                          'flex items-center justify-between gap-2 rounded-sm border px-3 py-2.5 text-[14px]',
                          option.isCorrect
                            ? 'border-win/50 bg-win/10 text-win'
                            : 'border-rail text-smoke',
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span className="font-data text-[11px] font-black text-ghost">
                            {String.fromCharCode(65 + index)}
                          </span>
                          {option.text}
                        </span>
                        {option.isCorrect ? <Check className="h-4 w-4 shrink-0" strokeWidth={3} /> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : reveal ? (
              <div className="mt-5 rounded-md border border-rail bg-pit p-4">
                <Kicker>Last answer</Kicker>
                <p className="mt-1 font-data text-[16px] font-bold text-win">
                  {reveal.correctAnswerText ?? 'Scored by the host'}
                </p>
              </div>
            ) : null}
          </div>

          {/* Field response */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-rail bg-rail lg:grid-cols-4">
            <Cell label="Connected" value={live.connectedCount} tone="win" />
            <Cell label="Answered" value={submitted} tone="volt" />
            <Cell label="Waiting" value={waiting} tone={waiting > 0 ? 'blaze' : 'chalk'} />
            <Cell label="Avg response" value={formatMs(stats?.averageResponseMs ?? null)} />
          </div>

          {question ? (
            <div className="rounded-md border border-rail bg-deck p-4">
              <div className="mb-2 flex items-center justify-between">
                <Kicker>Field response</Kicker>
                <span className="font-data text-[12px] font-bold text-chalk tnum">
                  {submitted}/{eligible}
                </span>
              </div>
              <Meter value={submitRate} tone={submitRate > 80 ? 'win' : 'volt'} />
            </div>
          ) : null}

          {/* Answer spread */}
          {stats && stats.optionBreakdown.length ? (
            <div className="rounded-md border border-rail bg-deck p-5">
              <Kicker className="mb-4">Answer spread</Kicker>
              <div className="space-y-3">
                {stats.optionBreakdown.map((option) => {
                  const share = stats.submitted ? option.count / stats.submitted : 0;
                  return (
                    <div key={option.optionId}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-[13px]">
                        <span className={cn('truncate', option.isCorrect ? 'font-semibold text-win' : 'text-smoke')}>
                          {option.label}
                          {option.isCorrect ? ' ✓' : ''}
                        </span>
                        <span className="shrink-0 font-data text-[12px] font-bold text-chalk tnum">
                          {option.count} · {formatPercent(share)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-ridge">
                        <div
                          className={cn(
                            'h-full rounded-full transition-[width] duration-500',
                            option.isCorrect ? 'bg-win' : 'bg-ghost',
                          )}
                          style={{ width: `${share * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-rail pt-3">
                <Tag tone="win">{stats.correct} correct</Tag>
                <Tag tone="loss">{stats.incorrect} wrong</Tag>
                {stats.pendingReview > 0 ? (
                  <Tag tone="flag">{stats.pendingReview} to review</Tag>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Controls: high-impact, visually separated */}
          <div className="sticky bottom-0 z-20 -mx-gutter border-t border-rail bg-ink/95 px-gutter py-4 backdrop-blur-md xl:static xl:mx-0 xl:rounded-md xl:border xl:px-4">
            <Kicker className="mb-3">Host controls</Kicker>

            <div className="grid gap-2 sm:grid-cols-2">
              {live.status === 'REGISTRATION_OPEN' ? (
                <Button
                  size="lg"
                  variant="steel"
                  loading={busy === 'waiting'}
                  onClick={() => run('waiting', 'waiting-room', 'Lobby open')}
                >
                  <DoorOpen className="h-4 w-4" />
                  Open lobby
                </Button>
              ) : null}

              {notStarted ? (
                <Button
                  size="xl"
                  className="sm:col-span-2"
                  loading={busy === 'start'}
                  disabled={questions.length === 0 || live.status === 'DRAFT'}
                  onClick={() => run('start', 'start', 'The arena is open')}
                >
                  <Play className="h-5 w-5" strokeWidth={3} />
                  Start tournament
                </Button>
              ) : null}

              {isLive ? (
                <>
                  {/* Two beats, not one: closing publishes scores and lets the
                      room see the result before the next question lands. */}
                  {question ? (
                    <Button
                      size="xl"
                      className="sm:col-span-2"
                      loading={busy === 'close'}
                      onClick={() => run('close', 'close-question', 'Round closed. Scores are out.')}
                    >
                      <Flag className="h-5 w-5" strokeWidth={3} />
                      Close round
                    </Button>
                  ) : (
                    <Button
                      size="xl"
                      className="sm:col-span-2"
                      loading={busy === 'next'}
                      onClick={() => run('next', 'next-question', 'Next round is live')}
                    >
                      <SkipForward className="h-5 w-5" strokeWidth={3} />
                      Start next round
                    </Button>
                  )}

                  {paused ? (
                    <Button
                      size="lg"
                      variant="steel"
                      loading={busy === 'resume'}
                      onClick={() => run('resume', 'resume', 'Back on')}
                    >
                      <Play className="h-4 w-4" />
                      Resume
                    </Button>
                  ) : (
                    <Button
                      size="lg"
                      variant="steel"
                      loading={busy === 'pause'}
                      onClick={() => run('pause', 'pause', 'Clock held')}
                    >
                      <Pause className="h-4 w-4" />
                      Pause
                    </Button>
                  )}

                  <Button size="lg" variant="danger" onClick={() => setConfirmEnd(true)}>
                    <Square className="h-4 w-4" />
                    End tournament
                  </Button>
                </>
              ) : null}

              {finished ? (
                <Link href={`/admin/tournaments/${params.id}/results`} className="sm:col-span-2">
                  <Button size="xl" block>
                    Results & analytics
                  </Button>
                </Link>
              ) : null}
            </div>

            {live.status === 'DRAFT' ? (
              <p className="mt-3 text-[13px] text-flag">
                Publish this tournament before you can start it.{' '}
                <Link href={`/admin/tournaments/${params.id}`} className="underline">
                  Open setup
                </Link>
              </p>
            ) : null}
          </div>
        </div>

        {/* ---------------- leaderboard rail ---------------- */}
        <aside className="space-y-3 xl:sticky xl:top-20 xl:self-start">
          <div className="flex items-center justify-between">
            <Kicker tone="volt">The rankings</Kicker>
            <span className="inline-flex items-center gap-1.5 font-data text-[10px] uppercase tracking-[0.12em] text-ghost">
              <Radio className="h-3 w-3" />
              {leaderboard?.total ?? 0}
            </span>
          </div>

          <div className="max-h-[70vh] overflow-y-auto rounded-md border border-rail">
            <Rankings
              entries={leaderboard?.entries ?? []}
              compact
              className="border-0 sm:border-0"
              emptyTitle="Board empty"
              emptyDescription="Standings appear the moment the first round closes."
            />
          </div>
        </aside>
      </div>

      <Sheet
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        kicker="Final call"
        title="End the tournament?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="lg" onClick={() => setConfirmEnd(false)}>
              Keep playing
            </Button>
            <Button
              variant="danger"
              size="lg"
              className="flex-1"
              loading={busy === 'end'}
              onClick={async () => {
                setConfirmEnd(false);
                await run('end', 'end', 'Tournament complete');
              }}
            >
              End it
            </Button>
          </>
        }
      >
        <p className="text-[14px] leading-relaxed text-smoke">
          The open round closes, final ranks are calculated, badges are awarded and every player is
          sent to the podium. This cannot be undone.
        </p>
      </Sheet>
    </AdminShell>
  );
}

function Cell({
  label,
  value,
  tone = 'chalk',
}: {
  label: string;
  value: React.ReactNode;
  tone?: React.ComponentProps<typeof Numeral>['tone'];
}) {
  return (
    <div className="bg-deck px-4 py-4">
      <Numeral value={value} label={label} size="md" tone={tone} />
    </div>
  );
}
