'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ListChecks, Plus, Radio, Settings } from 'lucide-react';
import { AdminShell } from '@/components/admin/admin-shell';
import { Button } from '@/components/ui/button';
import { EmptyState, Kicker, LoadingState } from '@/components/ui/primitives';
import { CodePlate, StatusTag } from '@/components/tournament/poster';
import { fetcher } from '@/lib/client/api';
import { cn, formatDateTime } from '@/lib/utils';
import type { TournamentSummaryDTO } from '@/types';

export default function AdminTournamentsPage() {
  const { data, isLoading } = useSWR<{ tournaments: TournamentSummaryDTO[] }>(
    '/api/tournaments?scope=hosted&limit=100',
    fetcher,
    { refreshInterval: 30_000 },
  );

  const tournaments = data?.tournaments ?? [];
  const anyLive = tournaments.some((t) => t.status === 'LIVE' || t.status === 'PAUSED');

  return (
    <AdminShell
      kicker="Your events"
      title="Tournaments"
      live={anyLive}
      actions={
        <Link href="/admin/tournaments/create">
          <Button>
            <Plus className="h-4 w-4" strokeWidth={3} />
            New tournament
          </Button>
        </Link>
      }
    >
      {isLoading ? (
        <LoadingState message="Loading your events" />
      ) : tournaments.length ? (
        <div className="overflow-hidden rounded-md border border-rail">
          {tournaments.map((tournament, index) => {
            const isLive = tournament.status === 'LIVE' || tournament.status === 'PAUSED';
            return (
              <div
                key={tournament.id}
                className={cn(
                  'flex flex-col gap-4 border-b border-rail bg-deck p-4 last:border-0 sm:flex-row sm:items-center',
                  isLive && 'bg-loss/5',
                )}
              >
                <span className="numeral hidden w-10 shrink-0 text-[1.375rem] text-ghost sm:block">
                  {String(index + 1).padStart(2, '0')}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusTag status={tournament.status} />
                    <Link
                      href={`/admin/tournaments/${tournament.id}`}
                      className="truncate font-data text-[15px] font-bold text-chalk transition-colors hover:text-volt"
                    >
                      {tournament.name}
                    </Link>
                    <CodePlate code={tournament.code} size="sm" />
                  </div>
                  <p className="mt-1.5 font-data text-[11px] uppercase tracking-[0.1em] text-ghost tnum">
                    {tournament.participantCount}/{tournament.maxParticipants} players ·{' '}
                    {tournament.questionCount} rounds · {formatDateTime(tournament.createdAt)}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <Link href={`/admin/tournaments/${tournament.id}/questions`}>
                    <Button size="sm" variant="steel">
                      <ListChecks className="h-4 w-4" />
                      Rounds
                    </Button>
                  </Link>
                  <Link href={`/admin/tournaments/${tournament.id}/live`}>
                    <Button size="sm" variant={isLive ? 'blaze' : 'volt'}>
                      <Radio className={cn('h-4 w-4', isLive && 'animate-live-blink')} />
                      {isLive ? 'Control' : 'Run'}
                    </Button>
                  </Link>
                  <Link href={`/admin/tournaments/${tournament.id}`} aria-label="Setup">
                    <Button size="icon" variant="ghost">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No tournaments yet"
          description="Build one, add rounds, publish it, then read the code out to the room."
          action={
            <Link href="/admin/tournaments/create">
              <Button size="lg">
                <Plus className="h-4 w-4" strokeWidth={3} />
                Build your first
              </Button>
            </Link>
          }
        />
      )}

      {tournaments.length ? (
        <Kicker className="mt-6 text-center">
          {tournaments.length} events hosted
        </Kicker>
      ) : null}
    </AdminShell>
  );
}
