'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import {
  Display,
  EmptyState,
  Kicker,
  LoadingState,
  Numeral,
  Tag,
} from '@/components/ui/primitives';
import { StatusTag } from '@/components/tournament/poster';
import { fetcher } from '@/lib/client/api';
import { cn, formatDateTime, formatMs, formatNumber } from '@/lib/utils';
import type { TournamentStatusDTO } from '@/types';

interface HistoryEntry {
  participantId: string;
  tournament: {
    id: string;
    code: string;
    name: string;
    status: TournamentStatusDTO;
    finishedAt: string | null;
    questionCount: number;
    participantCount: number;
  };
  finalRank: number | null;
  rank: number | null;
  totalPoints: number;
  correctCount: number;
  answeredCount: number;
  bestStreak: number;
  averageResponseMs: number | null;
  joinedAt: string;
}

export default function RecordPage() {
  const { data, isLoading } = useSWR<{ history: HistoryEntry[] }>('/api/users/me/history', fetcher);
  const history = data?.history ?? [];

  const finished = history.filter((row) => row.finalRank !== null);
  const wins = finished.filter((row) => row.finalRank === 1).length;
  const podiums = finished.filter((row) => (row.finalRank ?? 99) <= 3).length;
  const points = history.reduce((sum, row) => sum + row.totalPoints, 0);

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <Kicker>Career</Kicker>
          <Display size="lg" as="h1" className="mt-1">
            Your record
          </Display>
        </header>

        {isLoading ? (
          <LoadingState message="Pulling your record" />
        ) : history.length ? (
          <>
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-rail bg-rail">
              <div className="bg-deck px-4 py-4">
                <Numeral value={formatNumber(points)} label="Points won" size="md" tone="volt" />
              </div>
              <div className="bg-deck px-4 py-4">
                <Numeral value={wins} label="Wins" size="md" tone={wins ? 'win' : 'chalk'} />
              </div>
              <div className="bg-deck px-4 py-4">
                <Numeral value={podiums} label="Podiums" size="md" tone={podiums ? 'flag' : 'chalk'} />
              </div>
            </div>

            <div className="bleed overflow-hidden border-y border-rail sm:rounded-md sm:border-x">
              {history.map((entry) => {
                const rank = entry.finalRank ?? entry.rank;
                const finished =
                  entry.tournament.status === 'FINISHED' || entry.tournament.status === 'ARCHIVED';

                return (
                  <Link
                    key={entry.participantId}
                    href={
                      finished
                        ? `/tournaments/${entry.tournament.id}/result`
                        : `/tournaments/${entry.tournament.id}`
                    }
                    className="flex items-center gap-4 border-b border-rail bg-deck px-4 py-3.5 transition-colors last:border-0 hover:bg-ridge"
                  >
                    <span
                      className={cn(
                        'numeral w-12 shrink-0 text-[1.5rem]',
                        rank === 1
                          ? 'text-gold'
                          : rank === 2
                            ? 'text-silver'
                            : rank === 3
                              ? 'text-bronze'
                              : 'text-ghost',
                      )}
                    >
                      {rank ? `#${rank}` : '—'}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-data text-[14px] font-bold text-chalk">
                          {entry.tournament.name}
                        </p>
                        {!finished ? <StatusTag status={entry.tournament.status} /> : null}
                      </div>
                      <p className="mt-0.5 font-data text-[11px] uppercase tracking-[0.08em] text-ghost tnum">
                        {formatNumber(entry.totalPoints)} pts · {entry.correctCount}/
                        {entry.tournament.questionCount} correct · {formatMs(entry.averageResponseMs)}
                      </p>
                    </div>

                    <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                      {entry.bestStreak >= 3 ? (
                        <Tag tone="blaze">{entry.bestStreak} streak</Tag>
                      ) : null}
                      <span className="font-data text-[10px] uppercase tracking-[0.1em] text-ghost">
                        {formatDateTime(entry.tournament.finishedAt ?? entry.joinedAt)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        ) : (
          <EmptyState
            title="No battles yet"
            description="Play your first tournament and your whole competitive record lives here."
            action={
              <Link href="/tournaments">
                <Button size="lg">Find a battle</Button>
              </Link>
            }
          />
        )}
      </div>
    </AppShell>
  );
}
