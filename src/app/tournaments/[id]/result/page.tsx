'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import { Check, Clock, Hourglass, X } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { CountUp } from '@/components/ui/count-up';
import { Segmented } from '@/components/ui/sheet';
import {
  Display,
  EmptyState,
  Kicker,
  LoadingState,
  Numeral,
  Tag,
} from '@/components/ui/primitives';
import { Podium, Rankings } from '@/components/tournament/rankings';
import { celebrate } from '@/components/tournament/celebrate';
import { fetcher } from '@/lib/client/api';
import { useSession } from '@/lib/client/hooks';
import { cn, formatMs, formatNumber, formatPercent, ordinal } from '@/lib/utils';
import type { LeaderboardEntryDTO, PersonalStatsDTO, SubmissionOutcomeDTO } from '@/types';

interface ResultsResponse {
  tournament: {
    id: string;
    code: string;
    name: string;
    status: string;
    finishedAt: string | null;
    totalQuestions: number;
  };
  podium: LeaderboardEntryDTO[];
  standings: LeaderboardEntryDTO[];
  stats: {
    participants: number;
    averageScore: number;
    averageResponseMs: number | null;
    correctRate: number;
    fastestAnswer: { displayName: string; responseTimeMs: number } | null;
  };
  me: {
    standing: LeaderboardEntryDTO | null;
    personal: PersonalStatsDTO;
    badges: Array<{ code: string; name: string; icon: string; color: string; description: string }>;
    submissions: Array<{
      id: string;
      questionOrder: number;
      questionPrompt: string;
      outcome: SubmissionOutcomeDTO;
      awardedPoints: number;
      speedBonus: number;
      responseTimeMs: number | null;
      feedback: string | null;
      explanation: string | null;
      uploadedImageUrl: string | null;
    }>;
  } | null;
}

const OUTCOME = {
  CORRECT: { glyph: Check, tone: 'text-win', label: 'Correct' },
  PARTIAL: { glyph: Check, tone: 'text-flag', label: 'Partial' },
  INCORRECT: { glyph: X, tone: 'text-loss', label: 'Wrong' },
  NO_ANSWER: { glyph: Clock, tone: 'text-ghost', label: 'No answer' },
  PENDING: { glyph: Hourglass, tone: 'text-volt', label: 'Under review' },
} as const;

export default function FinalResultsPage() {
  const params = useParams<{ id: string }>();
  const { user } = useSession();
  const { data, isLoading } = useSWR<ResultsResponse>(
    `/api/tournaments/${params.id}/results`,
    fetcher,
  );
  const [tab, setTab] = React.useState('rankings');
  const fired = React.useRef(false);

  const myRank = data?.me?.standing?.rank;

  React.useEffect(() => {
    if (fired.current || !myRank) return;
    fired.current = true;
    void celebrate(myRank === 1 ? 'win' : myRank <= 3 ? 'podium' : 'finish');
  }, [myRank]);

  if (isLoading || !data) {
    return (
      <AppShell>
        <LoadingState message="Calculating the final rankings" />
      </AppShell>
    );
  }

  const done = data.tournament.status === 'FINISHED' || data.tournament.status === 'ARCHIVED';

  return (
    <AppShell>
      <div className="space-y-section">
        {/* --- the podium ---------------------------------------------- */}
        <section className="relative -mx-gutter overflow-hidden border-b border-rail bg-pit px-gutter pb-8 pt-6 sm:mx-0 sm:rounded-lg sm:border">
          <div className="pointer-events-none absolute inset-0 grid-field" aria-hidden />

          <div className="relative text-center">
            <Kicker tone="volt">{done ? 'Final' : 'Standing'}</Kicker>
            <Display size="xl" as="h1" className="mt-1.5">
              The rankings
            </Display>
            <p className="mt-2 font-data text-[13px] font-bold uppercase tracking-[0.1em] text-smoke">
              {data.tournament.name}
            </p>
          </div>

          {data.podium.length ? (
            <Podium entries={data.podium} className="relative mt-10" />
          ) : (
            <p className="relative mt-8 text-center text-[14px] text-ghost">
              No standings were recorded.
            </p>
          )}
        </section>

        {/* --- your performance ---------------------------------------- */}
        {data.me?.standing ? (
          <section>
            <div
              className={cn(
                'rounded-lg border-2 p-5 sm:p-6',
                myRank === 1
                  ? 'border-gold bg-gold/5'
                  : (myRank ?? 99) <= 3
                    ? 'border-volt bg-volt/5'
                    : 'border-rail bg-deck',
              )}
            >
              <Kicker tone={myRank === 1 ? 'chalk' : 'volt'}>Your performance</Kicker>

              <div className="mt-2 flex items-end justify-between gap-4">
                <Display size="xl">
                  {myRank === 1 ? 'Champion' : `You finished ${ordinal(data.me.standing.rank)}`}
                </Display>
                <p className="numeral shrink-0 text-[clamp(2.5rem,12vw,3.5rem)] text-volt">
                  <CountUp to={data.me.personal.totalPoints} />
                </p>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-rail bg-rail sm:grid-cols-4">
                <Cell
                  label="Correct"
                  value={`${data.me.personal.correctCount}/${data.me.personal.totalQuestions}`}
                  tone="win"
                />
                <Cell label="Avg time" value={formatMs(data.me.personal.averageResponseMs)} />
                <Cell
                  label="Fastest"
                  value={formatMs(data.me.personal.fastestAnswerMs)}
                  tone="blaze"
                />
                <Cell label="Best streak" value={data.me.personal.bestStreak} />
              </div>

              {data.me.badges.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {data.me.badges.map((badge, index) => (
                    <motion.span
                      key={badge.code}
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: index * 0.1, type: 'spring', stiffness: 400, damping: 18 }}
                      title={badge.description}
                      className="inline-flex items-center gap-2 rounded-sm border px-3 py-2"
                      style={{ borderColor: `${badge.color}55`, background: `${badge.color}12` }}
                    >
                      <span aria-hidden>{badge.icon}</span>
                      <span
                        className="font-data text-[10px] font-black uppercase tracking-[0.12em]"
                        style={{ color: badge.color }}
                      >
                        {badge.name}
                      </span>
                    </motion.span>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* --- the field ------------------------------------------------ */}
        <section>
          <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-rail bg-rail sm:grid-cols-4">
            <Cell label="Players" value={data.stats.participants} />
            <Cell label="Avg score" value={formatNumber(data.stats.averageScore)} />
            <Cell label="Correct rate" value={formatPercent(data.stats.correctRate)} tone="win" />
            <Cell
              label="Fastest answer"
              value={data.stats.fastestAnswer ? formatMs(data.stats.fastestAnswer.responseTimeMs) : '—'}
              tone="blaze"
              hint={data.stats.fastestAnswer?.displayName}
            />
          </div>

          <Segmented
            value={tab}
            onChange={setTab}
            className="mb-4"
            tabs={[
              { value: 'rankings', label: 'Full board' },
              { value: 'mine', label: 'Your answers' },
            ]}
          />

          {tab === 'rankings' ? (
            <div className="bleed">
              <Rankings
                entries={data.standings}
                youUserId={user?.id ?? null}
                showMovement={false}
              />
            </div>
          ) : data.me?.submissions.length ? (
            <div className="space-y-2">
              {data.me.submissions.map((submission) => {
                const meta = OUTCOME[submission.outcome] ?? OUTCOME.PENDING;
                const Glyph = meta.glyph;
                return (
                  <div key={submission.id} className="rounded-md border border-rail bg-deck p-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 shrink-0">
                        <Glyph className={cn('h-5 w-5', meta.tone)} strokeWidth={3} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="font-data text-[11px] font-bold uppercase tracking-[0.1em] text-ghost tnum">
                            R{String(submission.questionOrder + 1).padStart(2, '0')}
                          </span>
                          <Tag tone="neutral">{meta.label}</Tag>
                        </div>
                        <p className="mt-1.5 text-[14px] leading-snug text-chalk">
                          {submission.questionPrompt}
                        </p>
                        <p className="mt-2 font-data text-[11px] uppercase tracking-[0.1em] text-ghost tnum">
                          {formatNumber(submission.awardedPoints)} pts
                          {submission.speedBonus > 0 ? ` · +${submission.speedBonus} speed` : ''}
                          {submission.responseTimeMs !== null
                            ? ` · ${formatMs(submission.responseTimeMs)}`
                            : ''}
                        </p>
                        {submission.feedback ? (
                          <p className="mt-2 rounded-sm bg-pit p-2.5 text-[13px] text-smoke">
                            <span className="font-data text-[10px] uppercase tracking-[0.12em] text-volt">
                              Host note
                            </span>
                            <br />
                            {submission.feedback}
                          </p>
                        ) : null}
                        {submission.explanation ? (
                          <p className="mt-2 text-[13px] leading-relaxed text-ghost">
                            {submission.explanation}
                          </p>
                        ) : null}
                        {submission.uploadedImageUrl ? (
                          <a
                            href={submission.uploadedImageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-block font-data text-[11px] font-bold uppercase tracking-[0.1em] text-volt hover:underline"
                          >
                            View your solution
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="No answers"
              description="You were not on the roster for this one."
            />
          )}
        </section>

        <div className="flex flex-col gap-2 pb-4 sm:flex-row sm:justify-center">
          <Link href="/tournaments" className="sm:w-auto">
            <Button variant="steel" size="lg" block>
              Find another battle
            </Button>
          </Link>
          <Link href="/history" className="sm:w-auto">
            <Button size="lg" block>
              Your record
            </Button>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

function Cell({
  label,
  value,
  tone = 'chalk',
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone?: React.ComponentProps<typeof Numeral>['tone'];
  hint?: string;
}) {
  return (
    <div className="bg-deck px-4 py-3.5">
      <Numeral value={value} label={label} size="md" tone={tone} sub={hint} />
    </div>
  );
}
