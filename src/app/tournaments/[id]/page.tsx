'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { ArrowRight, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import {
  Display,
  Kicker,
  LoadingState,
  Numeral,
  RuleLabel,
  Tag,
} from '@/components/ui/primitives';
import { CodePlate, StatusTag, destinationFor } from '@/components/tournament/poster';
import { ApiClientError, api, fetcher } from '@/lib/client/api';
import { formatDateTime, formatNumber } from '@/lib/utils';
import type { ScoringConfigDTO, TournamentSummaryDTO } from '@/types';

interface DetailResponse {
  tournament: TournamentSummaryDTO & {
    rules: string | null;
    showLeaderboardAfterQuestion: boolean;
    showAnswersToParticipants: boolean;
    defaultTimeLimitSeconds: number;
    scoringConfig: ScoringConfigDTO;
    tieBreakers: string[];
  };
}

const TIE_LABELS: Record<string, string> = {
  TOTAL_POINTS: 'Points',
  CORRECT_COUNT: 'Correct answers',
  TOTAL_RESPONSE_TIME: 'Total time',
  EARLIEST_LAST_SUBMISSION: 'Earliest finish',
  BEST_STREAK: 'Best streak',
};

export default function BattleBriefPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<DetailResponse>(
    `/api/tournaments/${params.id}`,
    fetcher,
  );
  const [joining, setJoining] = React.useState(false);

  const tournament = data?.tournament;
  const joined = Boolean(tournament?.myParticipation);

  const join = async () => {
    if (!tournament) return;
    setJoining(true);
    try {
      const result = await api.post<{ pendingApproval: boolean }>(
        `/api/tournaments/${tournament.id}/join`,
        {},
      );
      await mutate();
      if (result.pendingApproval) {
        toast.info('Request sent. The host has to wave you through.');
      } else {
        toast.success("You're in");
        router.push(`/tournaments/${tournament.id}/waiting-room`);
      }
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not enter.');
    } finally {
      setJoining(false);
    }
  };

  if (isLoading || !tournament) {
    return (
      <AppShell>
        <LoadingState message="Opening the brief" />
      </AppShell>
    );
  }

  const scoring = tournament.scoringConfig;
  const full = tournament.participantCount >= tournament.maxParticipants;
  const canEnter = !joined && ['REGISTRATION_OPEN', 'WAITING'].includes(tournament.status) && !full;

  return (
    <AppShell>
      <div className="space-y-section">
        {/* --- the brief ----------------------------------------------- */}
        <section className="relative -mx-gutter overflow-hidden border-b border-rail bg-pit px-gutter pb-6 pt-6 sm:mx-0 sm:rounded-lg sm:border">
          <div className="pointer-events-none absolute inset-0 grid-field" aria-hidden />

          {tournament.coverImageUrl ? (
            <img
              src={tournament.coverImageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-20"
            />
          ) : null}

          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <StatusTag status={tournament.status} />
              <CodePlate code={tournament.code} size="sm" />
              {joined ? <Tag tone="win">Entered</Tag> : null}
            </div>

            <Display size="xl" as="h1" className="mt-4">
              {tournament.name}
            </Display>

            {tournament.description ? (
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-smoke">
                {tournament.description}
              </p>
            ) : null}

            <div className="mt-7 flex flex-wrap items-end gap-x-8 gap-y-4">
              <Numeral
                value={`${tournament.participantCount}/${tournament.maxParticipants}`}
                label="Players"
                size="lg"
                tone={full ? 'blaze' : 'chalk'}
              />
              <Numeral value={tournament.questionCount} label="Rounds" size="lg" />
              <Numeral
                value={`${tournament.defaultTimeLimitSeconds}s`}
                label="Per round"
                size="lg"
              />
            </div>

            {tournament.startAt ? (
              <p className="mt-4 font-data text-[12px] uppercase tracking-[0.1em] text-ghost">
                Scheduled · {formatDateTime(tournament.startAt)}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              {canEnter ? (
                <Button size="xl" block loading={joining} loadingLabel="Entering" onClick={join}>
                  Enter the battle
                  <ArrowRight className="h-5 w-5" strokeWidth={3} />
                </Button>
              ) : joined ? (
                <Link href={destinationFor(tournament)} className="flex-1">
                  <Button size="xl" block>
                    {tournament.status === 'FINISHED' ? 'See results' : 'Enter arena'}
                    <ArrowRight className="h-5 w-5" strokeWidth={3} />
                  </Button>
                </Link>
              ) : (
                <Button size="xl" block disabled>
                  {tournament.status === 'DRAFT'
                    ? 'Not open yet'
                    : full
                      ? 'Arena full'
                      : 'Entry closed'}
                </Button>
              )}

              <Link href={`/tournaments/${tournament.id}/leaderboard`} className="sm:w-auto">
                <Button size="xl" variant="steel" block>
                  <Trophy className="h-5 w-5" />
                  Rankings
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* --- how points work ----------------------------------------- */}
        <section>
          <RuleLabel className="mb-5">How points work</RuleLabel>

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-rail bg-rail sm:grid-cols-4">
            <ScoreCell label="Correct" value={`+${formatNumber(scoring.correctPoints)}`} tone="win" />
            <ScoreCell
              label="Speed bonus"
              value={scoring.speedBonusEnabled ? `+${scoring.speedBonusPoints}` : 'Off'}
              tone={scoring.speedBonusEnabled ? 'blaze' : 'smoke'}
            />
            <ScoreCell label="Wrong" value={formatNumber(scoring.wrongAnswerPoints)} tone="loss" />
            <ScoreCell label="No answer" value={formatNumber(scoring.noAnswerPoints)} tone="smoke" />
          </div>

          <p className="mt-4 text-[14px] leading-relaxed text-smoke">
            {scoring.speedBonusEnabled
              ? 'A correct answer pays the base points plus a speed bonus that shrinks as the clock drains. Answer early and it is worth real points.'
              : 'Every correct answer is worth the same, however fast it arrives.'}
            {scoring.streakBonusEnabled
              ? ` Consecutive correct answers stack ${scoring.streakBonusPoints} points per step, capped at ${scoring.streakBonusCap}.`
              : ''}
          </p>

          <div className="mt-5">
            <Kicker className="mb-2">Ties broken by</Kicker>
            <ol className="flex flex-wrap gap-1.5">
              {tournament.tieBreakers.map((key, index) => (
                <li key={key} className="flex items-center gap-1.5">
                  <span className="font-data text-[11px] font-bold text-ghost tnum">
                    {index + 1}
                  </span>
                  <Tag>{TIE_LABELS[key] ?? key}</Tag>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* --- rules ---------------------------------------------------- */}
        <section className="pb-4">
          <RuleLabel className="mb-5">The rules</RuleLabel>

          {tournament.rules ? (
            <p className="mb-4 whitespace-pre-wrap text-[14px] leading-relaxed text-smoke">
              {tournament.rules}
            </p>
          ) : null}

          <ul className="divide-y divide-rail overflow-hidden rounded-md border border-rail">
            {[
              'One answer per round, locked the moment you commit.',
              'The clock runs on the server, not your device.',
              tournament.showAnswersToParticipants
                ? 'The correct answer is revealed after each round.'
                : 'Correct answers stay sealed until the host publishes results.',
              tournament.showLeaderboardAfterQuestion
                ? 'The rankings update between rounds.'
                : 'Standings are only shown at the end.',
            ].map((rule) => (
              <li
                key={rule}
                className="flex items-start gap-3 bg-deck px-4 py-3 text-[14px] leading-snug text-smoke"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-volt" aria-hidden />
                {rule}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}

function ScoreCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: React.ComponentProps<typeof Numeral>['tone'];
}) {
  return (
    <div className="bg-deck px-4 py-4">
      <Numeral value={value} label={label} size="md" tone={tone} />
    </div>
  );
}
