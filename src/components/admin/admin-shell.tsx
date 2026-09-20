'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Avatar, Display, Kicker } from '@/components/ui/primitives';
import { api } from '@/lib/client/api';
import { useSession } from '@/lib/client/hooks';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin', label: 'Control', exact: true },
  { href: '/admin/tournaments', label: 'Tournaments' },
  { href: '/admin/analytics', label: 'Analytics' },
];

/**
 * Control room chrome.
 *
 * Denser than the player side and comfortable on a desktop, but the same
 * broadcast language: hairline rules, tracked-out kickers, VOLT for the live
 * thing. The top rail carries a hazard stripe whenever something is running.
 */
export function AdminShell({
  children,
  title,
  kicker,
  actions,
  tabs,
  live = false,
  wide = false,
}: {
  children: React.ReactNode;
  title?: string;
  kicker?: string;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  /** Draws the hazard rail and tints the chrome. */
  live?: boolean;
  /** Control-room width: 1440px instead of the default 1200. */
  wide?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useSession();

  const signOut = async () => {
    await api.post('/api/auth/logout');
    toast.success('Signed out');
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {live ? (
        <div className="h-1 animate-stripe-scroll hazard" aria-hidden />
      ) : (
        <div className="h-1 bg-volt" aria-hidden />
      )}

      <header className="sticky top-0 z-40 border-b border-rail bg-ink/95 backdrop-blur-md">
        <div className={cn('mx-auto flex h-14 items-center justify-between gap-6 px-gutter', wide ? 'max-w-[1440px]' : 'max-w-[1200px]')}>
          <div className="flex items-center gap-7">
            <Link href="/admin" className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-xs bg-volt">
                <span className="font-data text-[15px] font-black italic leading-none text-volt-ink">
                  {'//'}
                </span>
              </span>
              <span className="hidden font-data text-[10px] font-black uppercase tracking-[0.2em] text-smoke sm:block">
                Control room
              </span>
            </Link>

            <nav className="flex items-center gap-1">
              {NAV.map((item) => {
                const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'relative px-3 py-2 font-data text-[11px] font-bold uppercase tracking-[0.14em] transition-colors',
                      active ? 'text-volt' : 'text-ghost hover:text-chalk',
                    )}
                  >
                    {item.label}
                    {active ? (
                      <span className="absolute inset-x-3 -bottom-[11px] h-[2px] bg-volt" aria-hidden />
                    ) : null}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/admin/tournaments/create">
              <Button size="sm">
                <Plus className="h-4 w-4" strokeWidth={3} />
                <span className="hidden sm:inline">New</span>
              </Button>
            </Link>
            <Link href="/dashboard" title="Player view" aria-label="Player view">
              <Avatar name={user?.displayName ?? 'Host'} src={user?.avatarUrl} size={30} />
            </Link>
            <button
              type="button"
              onClick={signOut}
              aria-label="Sign out"
              className="grid h-10 w-10 place-items-center rounded-sm text-ghost transition-colors hover:bg-deck hover:text-chalk"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main
        className={cn(
          'mx-auto w-full flex-1 px-gutter py-6',
          wide ? 'max-w-[1440px]' : 'max-w-[1200px]',
        )}
      >
        {title ? (
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              {kicker ? <Kicker tone="volt">{kicker}</Kicker> : null}
              <Display size="lg" as="h1" className="mt-1">
                {title}
              </Display>
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
        ) : null}

        {tabs ? <div className="mb-6">{tabs}</div> : null}

        {children}
      </main>
    </div>
  );
}

/** Sub-navigation for one tournament. */
export function TournamentTabs({ tournamentId }: { tournamentId: string }) {
  const pathname = usePathname();

  const tabs = [
    { href: `/admin/tournaments/${tournamentId}`, label: 'Setup', exact: true },
    { href: `/admin/tournaments/${tournamentId}/questions`, label: 'Rounds' },
    { href: `/admin/tournaments/${tournamentId}/participants`, label: 'Roster' },
    { href: `/admin/tournaments/${tournamentId}/live`, label: 'Control' },
    { href: `/admin/tournaments/${tournamentId}/results`, label: 'Results' },
  ];

  return (
    <div className="no-scrollbar flex gap-0 overflow-x-auto rounded-md border border-rail bg-pit p-1">
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'flex min-h-[38px] flex-1 items-center justify-center whitespace-nowrap rounded-sm px-4',
              'font-data text-[11px] font-bold uppercase tracking-[0.12em] transition-colors',
              active ? 'bg-volt text-volt-ink' : 'text-smoke hover:bg-deck hover:text-chalk',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
