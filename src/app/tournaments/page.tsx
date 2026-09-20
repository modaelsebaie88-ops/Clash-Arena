'use client';

import * as React from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Search } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Segmented } from '@/components/ui/sheet';
import { Display, EmptyState, Kicker, Skeleton } from '@/components/ui/primitives';
import { TournamentPoster } from '@/components/tournament/poster';
import { fetcher } from '@/lib/client/api';
import type { TournamentSummaryDTO } from '@/types';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'REGISTRATION_OPEN', label: 'Open' },
  { value: 'WAITING,LIVE,PAUSED', label: 'Live' },
  { value: 'FINISHED', label: 'Done' },
];

export default function BattlesPage() {
  const [filter, setFilter] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(search), 280);
    return () => window.clearTimeout(id);
  }, [search]);

  const query = new URLSearchParams({ limit: '60' });
  if (filter !== 'all') query.set('status', filter);
  if (debounced) query.set('search', debounced);

  const { data, isLoading } = useSWR<{ tournaments: TournamentSummaryDTO[]; total: number }>(
    `/api/tournaments?${query.toString()}`,
    fetcher,
    { refreshInterval: 30_000 },
  );

  const tournaments = data?.tournaments ?? [];
  const live = tournaments.filter((t) => t.status === 'LIVE' || t.status === 'PAUSED');
  const rest = tournaments.filter((t) => !live.includes(t));

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <Kicker>The schedule</Kicker>
          <Display size="lg" as="h1" className="mt-1">
            Battles
          </Display>
        </header>

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ghost" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or code"
              aria-label="Search tournaments"
              className="pl-11"
            />
          </div>
          <Segmented tabs={FILTERS} value={filter} onChange={setFilter} />
        </div>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-52" />
            ))}
          </div>
        ) : tournaments.length ? (
          <div className="space-y-8">
            {live.length ? (
              <section>
                <Kicker tone="blaze" className="mb-3">
                  Happening now
                </Kicker>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {live.map((tournament, index) => (
                    <TournamentPoster key={tournament.id} tournament={tournament} index={index + 1} />
                  ))}
                </div>
              </section>
            ) : null}

            {rest.length ? (
              <section>
                {live.length ? (
                  <Kicker className="mb-3">Everything else</Kicker>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {rest.map((tournament, index) => (
                    <TournamentPoster
                      key={tournament.id}
                      tournament={tournament}
                      index={live.length + index + 1}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : (
          <EmptyState
            title={debounced ? 'No match' : 'No battles yet'}
            description={
              debounced
                ? `Nothing matches "${debounced}". Try the tournament code instead.`
                : 'Nothing is scheduled under this filter. A host can invite you with a code.'
            }
            action={
              <Link href="/join">
                <Button size="lg">Enter a code</Button>
              </Link>
            }
          />
        )}
      </div>
    </AppShell>
  );
}
