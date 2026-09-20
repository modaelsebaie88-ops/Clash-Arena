'use client';

import * as React from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import {
  Display,
  EmptyState,
  Kicker,
  LiveTag,
  Numeral,
  SectionHead,
  Skeleton,
  Tag,
} from '@/components/ui/primitives';
import { TournamentPoster, destinationFor } from '@/components/tournament/poster';
import { fetcher } from '@/lib/client/api';
import { useSession } from '@/lib/client/hooks';
import { cn, formatNumber, formatPercent } from '@/lib/utils';
import type { TournamentSummaryDTO } from '@/types';

interface OverviewResponse {
  stats: {
    tournamentsPlayed: number;
    wins: number;
    podiums: number;
    totalPoints: number;
    averageRank: number | null;
    accuracy: number;
    bestStreak: number;
  };
  badges: Array<{ code: string; name: string; icon: string; color: string }>;
  recent: Array<{ participantId: string; finalRank: number | null; totalPoints: number }>;
}

export default function HomePage() {
  const { user } = useSession();
  const { data: overview, isLoading: loadingStats } = useSWR<OverviewResponse>(
    '/api/users/me',
    fetcher,
  );
  const { data: browse, isLoading: loadingBattles } = useSWR<{
    tournaments: TournamentSummaryDTO[];
  }>('/api/tournaments?limit=20', fetcher, { refreshInterval: 30_000 });

  const tournaments = browse?.tournaments ?? [];
  const mine = tournaments.filter((tournament) => tournament.myParticipation);

  // Priority: something running > a lobby you are in > your next start > any open entry.
  const featured =
    mine.find((t) => t.status === 'LIVE' || t.status === 'PAUSED') ??
    mine.find((t) => t.status === 'WAITING') ??
    mine.find((t) => t.status === 'REGISTRATION_OPEN') ??
    tournaments.find((t) => t.status === 'REGISTRATION_OPEN') ??
    null;

  const open = tournaments.filter(
    (t) => t.status === 'REGISTRATION_OPEN' && t.id !== featured?.id,
  );
  const finished = mine.filter((t) => t.status === 'FINISHED').slice(0, 3);

  return (
    <AppShell>
      <div className="space-y-section">
        {/* --- greeting ------------------------------------------------ */}
        <header>
          <Kicker>{greeting()}</Kicker>
          <Display size="lg" as="h1" className="mt-1">
            {user?.displayName ?? 'Competitor'}
          </Display>
        </header>

        {/* --- the one thing that matters right now -------------------- */}
        <section>
          <SectionHead index="01" title="Your next battle" />
          {loadingBattles ? (
            <Skeleton className="h-64" />
          ) : featured ? (
            <FeaturedBattle tournament={featured} />
          ) : (
            <EmptyState
              title="No battles yet"
              description="Your next competition will appear here. Got a code from a host?"
              action={
                <Link href="/join">
                  <Button size="lg">Enter a code</Button>
                </Link>
              }
            />
          )}
        </section>

        {/* --- your record --------------------------------------------- */}
        <section>
          <SectionHead
            index="02"
            title="Your record"
            action={
              <Link
                href="/profile"
                className="font-data text-[11px] font-bold uppercase tracking-[0.12em] text-volt hover:underline"
              >
                Full profile
              </Link>
            }
          />

          {loadingStats ? (
            <Skeleton className="h-24" />
          ) : (
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-rail bg-rail sm:grid-cols-4">
              <RecordCell
                label="Total points"
                value={formatNumber(overview?.stats.totalPoints ?? 0)}
                tone="volt"
              />
              <RecordCell label="Battles" value={overview?.stats.tournamentsPlayed ?? 0} />
              <RecordCell
                label="Wins"
                value={overview?.stats.wins ?? 0}
                tone={overview?.stats.wins ? 'win' : 'chalk'}
              />
              <RecordCell
                label="Accuracy"
                value={formatPercent(overview?.stats.accuracy ?? 0)}
              />
            </div>
          )}

          {overview?.badges.length ? (
            <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
              {overview.badges.slice(0, 8).map((badge, index) => (
                <span
                  key={`${badge.code}-${index}`}
                  className="flex shrink-0 items-center gap-1.5 rounded-sm border px-2.5 py-1.5"
                  style={{ borderColor: `${badge.color}55`, background: `${badge.color}12` }}
                >
                  <span aria-hidden>{badge.icon}</span>
                  <span
                    className="font-data text-[10px] font-black uppercase tracking-[0.1em]"
                    style={{ color: badge.color }}
                  >
                    {badge.name}
                  </span>
                </span>
              ))}
            </div>
          ) : null}
        </section>

        {/* --- open entries -------------------------------------------- */}
        <section>
          <SectionHead
            index="03"
            title="Open for entry"
            action={
              <Link
                href="/tournaments"
                className="font-data text-[11px] font-bold uppercase tracking-[0.12em] text-volt hover:underline"
              >
                See all
              </Link>
            }
          />

          {loadingBattles ? (
            <div className="space-y-3">
              <Skeleton className="h-44" />
              <Skeleton className="h-44" />
            </div>
          ) : open.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {open.slice(0, 6).map((tournament, index) => (
                <TournamentPoster
                  key={tournament.id}
                  tournament={tournament}
                  index={index + 1}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Nothing open"
              description="No tournaments are taking entries right now. Check back before the next event."
            />
          )}
        </section>

        {/* --- recent results ------------------------------------------ */}
        {finished.length ? (
          <section>
            <SectionHead index="04" title="Last results" />
            <div className="overflow-hidden rounded-md border border-rail">
              {finished.map((tournament) => (
                <Link
                  key={tournament.id}
                  href={`/tournaments/${tournament.id}/result`}
                  className="flex items-center gap-4 border-b border-rail bg-deck px-4 py-3 last:border-0 transition-colors hover:bg-ridge"
                >
                  <span
                    className={cn(
                      'numeral w-10 shrink-0 text-[1.375rem]',
                      tournament.myParticipation?.finalRank === 1 ? 'text-gold' : 'text-smoke',
                    )}
                  >
                    {tournament.myParticipation?.finalRank
                      ? `#${tournament.myParticipation.finalRank}`
                      : '—'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-data text-[14px] font-bold text-chalk">
                      {tournament.name}
                    </p>
                    <p className="font-data text-[11px] uppercase tracking-[0.1em] text-ghost tnum">
                      {formatNumber(tournament.myParticipation?.totalPoints ?? 0)} pts
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-ghost" />
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */

function FeaturedBattle({ tournament }: { tournament: TournamentSummaryDTO }) {
  const live = tournament.status === 'LIVE' || tournament.status === 'PAUSED';
  const lobby = tournament.status === 'WAITING';
  const joined = Boolean(tournament.myParticipation);
  const countdown = useStartCountdown(tournament.startAt);

  const cta = live
    ? 'Enter arena'
    : lobby
      ? 'Enter lobby'
      : joined
        ? 'View battle'
        : 'Enter the battle';

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border bg-deck',
        live ? 'border-loss/60' : 'border-rail',
      )}
    >
      {live ? (
        <span className="absolute inset-x-0 top-0 h-1.5 animate-stripe-scroll hazard" aria-hidden />
      ) : null}

      <div className="relative p-5 pt-7 sm:p-7">
        <div className="flex items-center gap-2">
          {live ? <LiveTag /> : lobby ? <Tag tone="blaze">Lobby open</Tag> : <Tag tone="volt">Entry open</Tag>}
          {joined ? <Tag tone="win">Entered</Tag> : null}
        </div>

        <Display size="xl" className="mt-4">
          {tournament.name}
        </Display>

        <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-4">
          <Numeral value={tournament.participantCount} label="Players in" size="lg" />
          <Numeral value={tournament.questionCount} label="Rounds" size="lg" />
          {live ? (
            <Numeral value="LIVE" label="Status" size="lg" tone="loss" />
          ) : countdown ? (
            <Numeral value={countdown} label="Starts in" size="lg" tone="volt" />
          ) : null}
        </div>

        <Link href={destinationFor(tournament)} className="mt-6 block">
          <Button size="xl" block variant={live ? 'blaze' : 'volt'}>
            {cta}
            <ArrowRight className="h-5 w-5" strokeWidth={3} />
          </Button>
        </Link>
      </div>
    </div>
  );
}

function RecordCell({
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

/** Live mm:ss until kickoff, or null once the start time has passed. */
function useStartCountdown(startAt: string | null) {
  const [label, setLabel] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!startAt) {
      setLabel(null);
      return;
    }

    const tick = () => {
      const remaining = new Date(startAt).getTime() - Date.now();
      if (remaining <= 0) {
        setLabel(null);
        return;
      }
      const totalSeconds = Math.floor(remaining / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      setLabel(
        hours > 0
          ? `${hours}:${String(minutes).padStart(2, '0')}`
          : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
      );
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startAt]);

  return label;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
