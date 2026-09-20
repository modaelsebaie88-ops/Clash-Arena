'use client';

import * as React from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, Plus } from 'lucide-react';
import { AdminShell } from '@/components/admin/admin-shell';
import { Button } from '@/components/ui/button';
import {
  Display,
  EmptyState,
  Kicker,
  LiveTag,
  Numeral,
  RoundPips,
  RuleLabel,
  Skeleton,
} from '@/components/ui/primitives';
import { CodePlate, StatusTag } from '@/components/tournament/poster';
import { fetcher } from '@/lib/client/api';
import { cn, formatDateTime, formatMs, formatNumber } from '@/lib/utils';
import type {
  LeaderboardDTO,
  LiveTournamentStateDTO,
  TournamentStatusDTO,
  TournamentSummaryDTO,
} from '@/types';

interface OverviewResponse {
  totals: {
    tournaments: number;
    participants: number;
    submissions: number;
    players: number;
    averageResponseMs: number | null;
  };
  byStatus: Record<string, number>;
  recent: Array<{
    id: string;
    name: string;
    code: string;
    status: TournamentStatusDTO;
    createdAt: string;
  }>;
}

export default function ControlHomePage() {
  const { data: overview, isLoading } = useSWR<OverviewResponse>('/api/admin/overview', fetcher, {
    refreshInterval: 20_000,
  });
  const { data: hosted } = useSWR<{ tournaments: TournamentSummaryDTO[] }>(
    '/api/tournaments?scope=hosted&limit=50',
    fetcher,
    { refreshInterval: 15_000 },
  );

  const running = (hosted?.tournaments ?? []).find(
    (tournament) => tournament.status === 'LIVE' || tournament.status === 'PAUSED',
  );
  const lobby = (hosted?.tournaments ?? []).find((tournament) => tournament.status === 'WAITING');
  const spotlight = running ?? lobby ?? null;

  return (
    <AdminShell
      kicker="Host"
      title="Control"
      live={Boolean(running)}
      actions={
        <Link href="/admin/tournaments/create">
          <Button size="md">
            <Plus className="h-4 w-4" strokeWidth={3} />
            New tournament
          </Button>
        </Link>
      }
    >
      <div className="space-y-section">
        <section>
          {isLoading ? (
            <Skeleton className="h-52" />
          ) : spotlight ? (
            <SpotlightPanel tournament={spotlight} />
          ) : (
            <EmptyState
              title="Nothing live"
              description="No tournament is running. Publish one and open the lobby when your players are in the room."
              action={
                <Link href="/admin/tournaments/create">
                  <Button size="lg">Build a tournament</Button>
                </Link>
              }
            />
          )}
        </section>

        <section>
          <RuleLabel className="mb-5">Totals</RuleLabel>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-rail bg-rail lg:grid-cols-4">
            <Cell
              label="Tournaments"
              value={overview?.totals.tournaments ?? 0}
              tone="volt"
              hint={`${overview?.byStatus.DRAFT ?? 0} drafts`}
            />
            <Cell
              label="Entries"
              value={formatNumber(overview?.totals.participants ?? 0)}
              hint={`${overview?.byStatus.REGISTRATION_OPEN ?? 0} open now`}
            />
            <Cell
              label="Answers"
              value={formatNumber(overview?.totals.submissions ?? 0)}
            />
            <Cell
              label="Avg response"
              value={formatMs(overview?.totals.averageResponseMs ?? null)}
              tone="blaze"
            />
          </div>
        </section>

        <section className="pb-4">
          <RuleLabel className="mb-5">Recent</RuleLabel>

          {isLoading ? (
            <Skeleton className="h-40" />
          ) : overview?.recent.length ? (
            <div className="overflow-hidden rounded-md border border-rail">
              {overview.recent.map((tournament) => {
                const isLive = tournament.status === 'LIVE' || tournament.status === 'PAUSED';
                return (
                  <Link
                    key={tournament.id}
                    href={
                      isLive
                        ? `/admin/tournaments/${tournament.id}/live`
                        : `/admin/tournaments/${tournament.id}`
                    }
                    className="flex items-center gap-4 border-b border-rail bg-deck px-4 py-3 transition-colors last:border-0 hover:bg-ridge"
                  >
                    <StatusTag status={tournament.status} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-data text-[14px] font-bold text-chalk">
                        {tournament.name}
                      </p>
                      <p className="font-data text-[10px] uppercase tracking-[0.1em] text-ghost">
                        {formatDateTime(tournament.createdAt)}
                      </p>
                    </div>
                    <CodePlate code={tournament.code} size="sm" />
                    <ArrowRight className="h-4 w-4 shrink-0 text-ghost" />
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No tournaments yet" />
          )}
        </section>
      </div>
    </AdminShell>
  );
}

/** Live status for the one tournament that matters right now. */
function SpotlightPanel({ tournament }: { tournament: TournamentSummaryDTO }) {
  const live = tournament.status === 'LIVE' || tournament.status === 'PAUSED';

  const { data: stateData } = useSWR<{ state: LiveTournamentStateDTO }>(
    `/api/tournaments/${tournament.id}/state`,
    fetcher,
    { refreshInterval: 4_000 },
  );
  const { data: board } = useSWR<LeaderboardDTO>(
    live ? `/api/tournaments/${tournament.id}/leaderboard?limit=3` : null,
    fetcher,
    { refreshInterval: 8_000 },
  );

  const state = stateData?.state;
  const leader = board?.entries[0];

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border bg-deck p-5 sm:p-6',
        live ? 'border-loss/50' : 'border-volt/40',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {live ? <LiveTag /> : <StatusTag status={tournament.status} />}
        <CodePlate code={tournament.code} size="sm" />
      </div>

      <Display size="xl" className="mt-4">
        {tournament.name}
      </Display>

      {state && state.questionCount > 0 ? (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <Kicker>
              Round {String(state.currentQuestionIndex ?? 0).padStart(2, '0')} / {state.questionCount}
            </Kicker>
            <Kicker tone={state.currentQuestion ? 'volt' : 'smoke'}>
              {state.currentQuestion ? 'Question open' : 'Between rounds'}
            </Kicker>
          </div>
          <RoundPips
            total={state.questionCount}
            current={Math.max(1, state.currentQuestionIndex ?? 1)}
          />
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-rail bg-rail sm:grid-cols-4">
        <Cell label="On roster" value={state?.participantCount ?? tournament.participantCount} />
        <Cell label="Connected" value={state?.connectedCount ?? 0} tone="win" />
        <Cell label="Rounds" value={tournament.questionCount} />
        <Cell
          label="Leader"
          value={leader ? formatNumber(leader.totalPoints) : '—'}
          tone="volt"
          hint={leader?.displayName}
        />
      </div>

      <Link href={`/admin/tournaments/${tournament.id}/live`} className="mt-5 block">
        <Button size="xl" block variant={live ? 'blaze' : 'volt'}>
          {live ? 'Open control room' : 'Start the tournament'}
          <ArrowRight className="h-5 w-5" strokeWidth={3} />
        </Button>
      </Link>
    </div>
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
    <div className="bg-deck px-4 py-4">
      <Numeral value={value} label={label} size="md" tone={tone} sub={hint} />
    </div>
  );
}
