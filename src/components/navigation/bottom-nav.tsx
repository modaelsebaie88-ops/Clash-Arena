'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Grid2x2, History, Plus, Swords, User, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Floating arena nav.
 *
 * Five thumb-sized cells with a raised VOLT JOIN action in the middle, lifted
 * clear of the iOS home indicator. The active cell gets a VOLT bar across its
 * top edge plus a VOLT label - not a filled pill, which would read as a generic
 * tab bar.
 */

const CELLS = [
  { href: '/dashboard', label: 'Home', icon: Swords },
  { href: '/tournaments', label: 'Battles', icon: Grid2x2 },
  { href: '/history', label: 'Record', icon: History },
  { href: '/profile', label: 'Player', icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 px-gutter pb-safe md:hidden"
    >
      <div className="relative mx-auto flex max-w-md items-stretch rounded-lg border border-rail bg-pit/95 backdrop-blur-md">
        {CELLS.slice(0, 2).map((cell) => (
          <NavCell key={cell.href} {...cell} active={isActive(cell.href)} />
        ))}

        {/* Centre action: the fastest route into a live tournament. */}
        <div className="relative w-[72px] shrink-0">
          <Link
            href="/join"
            aria-label="Join with a code"
            className="pressable absolute -top-5 left-1/2 grid h-14 w-14 -translate-x-1/2 place-items-center rounded-md bg-volt text-volt-ink shadow-volt"
          >
            <Plus className="h-6 w-6" strokeWidth={3} />
          </Link>
          <span className="pointer-events-none absolute bottom-2.5 left-0 w-full text-center font-data text-[9px] font-bold uppercase tracking-[0.14em] text-volt">
            Join
          </span>
        </div>

        {CELLS.slice(2).map((cell) => (
          <NavCell key={cell.href} {...cell} active={isActive(cell.href)} />
        ))}
      </div>
    </nav>
  );
}

function NavCell({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className="relative flex min-h-[64px] flex-1 flex-col items-center justify-center gap-1 rounded-lg"
    >
      {active ? (
        <span
          className="absolute inset-x-3 top-0 h-[3px] rounded-full bg-volt"
          aria-hidden
        />
      ) : null}
      <Icon
        className={cn('h-5 w-5 transition-colors', active ? 'text-volt' : 'text-ghost')}
        strokeWidth={active ? 2.5 : 2}
      />
      <span
        className={cn(
          'font-data text-[9px] font-bold uppercase tracking-[0.14em] transition-colors',
          active ? 'text-volt' : 'text-ghost',
        )}
      >
        {label}
      </span>
    </Link>
  );
}
