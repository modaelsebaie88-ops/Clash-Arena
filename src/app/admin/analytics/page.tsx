'use client';

import * as React from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { AdminShell } from '@/components/admin/admin-shell';
import {
  QuestionDifficultyChart,
  RankProgressionChart,
  ResponseTimeChart,
  ScoreDistributionChart,
  type QuestionAnalyticsRow,
} from '@/components/admin/analytics-charts';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { EmptyState, Kicker, LoadingState, Numeral, RuleLabel } from '@/components/ui/primitives';
import { StatusTag } from '@/components/tournament/poster';
import { fetcher } from '@/lib/client/api';
import { formatMs, formatNumber, formatPercent } from '@/lib/utils';
import type { TournamentSummaryDTO } from '@/types';

interface PlatformResponse {
  totals: {
    tournaments: number;
    participants: number;
    submissions: number;
    players: number;
    averageResponseMs: number | null;
  };
  byStatus: Record<string, number>;
}

interface AnalyticsResponse {
  tournament: { id: string; name: string; code: string; status: string };
  summary: {
    participants: number;
    averageScore: number;
    medianScore: number;
    topScore: number;
    averageResponseMs: number | null;
    correctRate: number;
    participationRate: number;
    answeredSubmissions: number;
  };
  questions: QuestionAnalyticsRow[];
  scoreDistribution: Array<{ bucket: string; count: number }>;
  responseTimeDistribution: Array<{ bucket: string; count: number }>;
  rankProgression: Array<{
    userId: string;
    displayName: string;
    points: Array<{ questionOrder: number; rank: number; points: number }>;
  }>;
}

export default function AnalyticsPage() {
  const { data: platform } = useSWR<PlatformResponse>('/api/admin/overview', fetcher);
  const { data: hosted } = useSWR<{ tournaments: TournamentSummaryDTO[] }>(
    '/api/tournaments?scope=hosted&limit=100',
    fetcher,
  );

  const played = React.useMemo(
    () =>
      (hosted?.tournaments ?? []).filter((tournament) =>
        ['LIVE', 'PAUSED', 'FINISHED', 'ARCHIVED'].includes(tournament.status),
      ),
    [hosted],
  );

  const [selected, setSelected] = React.useState('');

  React.useEffect(() => {
    if (!selected && played.length) setSelected(played[0].id);
  }, [played, selected]);

  const { data: analytics, isLoading } = useSWR<AnalyticsResponse>(
    selected ? `/api/tournaments/${selected}/analytics` : null,
    fetcher,
  );

  const current = played.find((tournament) => tournament.id === selected);

  return (
    <AdminShell
      kicker="Across your events"
      title="Analytics"
      actions={
        played.length ? (
          <Select
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            aria-label="Choose a tournament"
            className="w-full sm:w-80"
          >
            {played.map((tournament) => (
              <option key={tournament.id} value={tournament.id}>
                {tournament.name} · {tournament.code}
              </option>
            ))}
          </Select>
        ) : null
      }
    >
      <div className="space-y-section">
        <section>
          <RuleLabel className="mb-5">Lifetime</RuleLabel>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-rail bg-rail lg:grid-cols-4">
            <Cell label="Tournaments" value={platform?.totals.tournaments ?? 0} tone="volt" />
            <Cell label="Entries" value={formatNumber(platform?.totals.participants ?? 0)} />
            <Cell label="Answers" value={formatNumber(platform?.totals.submissions ?? 0)} />
            <Cell
              label="Avg response"
              value={formatMs(platform?.totals.averageResponseMs ?? null)}
              tone="blaze"
            />
          </div>
        </section>

        {!played.length ? (
          <EmptyState
            title="No data yet"
            description="Run a tournament and its difficulty curve, response times, score spread and rank climbs land here."
            action={
              <Link href="/admin/tournaments/create">
                <Button size="lg">Build a tournament</Button>
              </Link>
            }
          />
        ) : isLoading || !analytics ? (
          <LoadingState message="Crunching the numbers" />
        ) : (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Kicker tone="volt">{analytics.tournament.name}</Kicker>
              {current ? <StatusTag status={current.status} /> : null}
              <Link
                href={`/admin/tournaments/${analytics.tournament.id}/results`}
                className="font-data text-[11px] font-bold uppercase tracking-[0.12em] text-volt hover:underline"
              >
                Full results
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-rail bg-rail lg:grid-cols-4">
              <Cell label="Players" value={analytics.summary.participants} />
              <Cell
                label="Avg score"
                value={formatNumber(analytics.summary.averageScore)}
                hint={`top ${formatNumber(analytics.summary.topScore)}`}
              />
              <Cell label="Correct rate" value={formatPercent(analytics.summary.correctRate)} tone="win" />
              <Cell
                label="Participation"
                value={formatPercent(analytics.summary.participationRate)}
                tone="blaze"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <ScoreDistributionChart data={analytics.scoreDistribution} />
              <ResponseTimeChart data={analytics.responseTimeDistribution} />
            </div>

            <QuestionDifficultyChart questions={analytics.questions} />
            <RankProgressionChart series={analytics.rankProgression} />
          </section>
        )}
      </div>
    </AdminShell>
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
