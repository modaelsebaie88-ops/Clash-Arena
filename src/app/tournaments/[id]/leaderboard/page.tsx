'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { ChevronLeft } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Display, Kicker, LoadingState, Numeral } from '@/components/ui/primitives';
import { Podium, RankingsWithYou } from '@/components/tournament/rankings';
import { SignalDot } from '@/components/tournament/poster';
import { fetcher } from '@/lib/client/api';
import { useSession } from '@/lib/client/hooks';
import { useSocketEvent, useTournamentSocket } from '@/lib/client/socket';
import type { LeaderboardDTO } from '@/types';

/** Standalone board. Pushed over the socket, polled as a safety net. */
export default function RankingsPage() {
  const params = useParams<{ id: string }>();
  const { user } = useSession();

  const { data, mutate, isLoading } = useSWR<LeaderboardDTO>(
    `/api/tournaments/${params.id}/leaderboard?limit=100`,
    fetcher,
    { refreshInterval: 20_000 },
  );

  const [live, setLive] = React.useState<LeaderboardDTO | null>(null);
  const { socket, connected } = useTournamentSocket(params.id);

  useSocketEvent(socket, 'leaderboard:updated', (payload) => {
    if (payload.entries.length) setLive(payload);
    void mutate();
  });

  useSocketEvent(socket, 'tournament:ended', (payload) => {
    setLive(payload.leaderboard);
    void mutate();
  });

  const board = live ?? data;
  const entries = board?.entries ?? [];
  const you = entries.find((entry) => entry.userId === user?.id);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href={`/tournaments/${params.id}`}
            className="-ml-2 inline-flex items-center gap-1 rounded-sm px-2 py-1 font-data text-[11px] font-bold uppercase tracking-[0.12em] text-ghost transition-colors hover:text-chalk"
          >
            <ChevronLeft className="h-4 w-4" />
            Battle
          </Link>
          <SignalDot connected={connected} />
        </div>

        <header className="text-center">
          <Kicker tone="volt">{board?.total ?? 0} competitors</Kicker>
          <Display size="xl" as="h1" className="mt-1.5">
            The rankings
          </Display>
        </header>

        {isLoading && !board ? (
          <LoadingState message="Reading the board" />
        ) : entries.length ? (
          <>
            <Podium entries={entries.slice(0, 3)} className="pb-2" />

            {you ? (
              <div className="flex items-center justify-center gap-8 rounded-md border border-volt/40 bg-volt/5 py-4">
                <Numeral value={`#${you.rank}`} label="Your position" size="lg" tone="volt" align="center" />
                <Numeral value={you.totalPoints} label="Your points" size="lg" align="center" />
                <Numeral value={you.correctCount} label="Correct" size="lg" align="center" />
              </div>
            ) : null}

            <div className="bleed">
              <RankingsWithYou entries={entries} youUserId={user?.id ?? null} />
            </div>
          </>
        ) : (
          <div className="rounded-md border border-dashed border-rail px-6 py-14 text-center">
            <Display size="md" className="text-smoke">
              No scores yet
            </Display>
            <p className="mt-2 text-[13px] text-ghost">
              The board fills the moment the first round closes.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
