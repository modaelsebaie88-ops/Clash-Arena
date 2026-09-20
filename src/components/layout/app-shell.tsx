'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, LogOut, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { BottomNav } from '@/components/navigation/bottom-nav';
import { Avatar, Kicker, Tag } from '@/components/ui/primitives';
import { api } from '@/lib/client/api';
import { useNotifications, useSession } from '@/lib/client/hooks';
import { getSocket } from '@/lib/client/socket';
import { cn, formatRelative } from '@/lib/utils';
import type { NotificationDTO } from '@/types';

/** Pushed to the bell, never raised as a toast. */
const SILENT_NOTIFICATIONS = new Set([
  'TOURNAMENT_STARTED',
  'TOURNAMENT_STARTING',
  'QUESTION_STARTED',
]);

const DESKTOP_NAV = [
  { href: '/dashboard', label: 'Home' },
  { href: '/tournaments', label: 'Battles' },
  { href: '/history', label: 'Record' },
  { href: '/profile', label: 'Player' },
];

/**
 * Participant chrome: a thin status strip on top, the stage in the middle, and
 * the floating nav at the bottom on phones. From `md` the nav moves inline into
 * the top bar and the bottom nav disappears.
 */
export function AppShell({
  children,
  /** Hide all navigation. Used during a live round so nothing competes. */
  bare = false,
}: {
  children: React.ReactNode;
  bare?: boolean;
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
      <header className="sticky top-0 z-40 border-b border-rail bg-ink/90 backdrop-blur-md">
        <div className="container flex h-14 items-center justify-between gap-4">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <Wordmark />
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {DESKTOP_NAV.map((item) => {
              const active =
                item.href === '/dashboard'
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
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
                    <span className="absolute inset-x-3 -bottom-[13px] h-[2px] bg-volt" aria-hidden />
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-1">
            <Link
              href="/join"
              className="hidden h-9 items-center rounded-sm bg-volt px-4 font-data text-[11px] font-extrabold uppercase tracking-[0.12em] text-volt-ink transition-colors hover:bg-volt-deep md:inline-flex"
            >
              Join code
            </Link>

            <NotificationBell />

            {user?.role === 'ADMIN' ? (
              <Link
                href="/admin"
                title="Control room"
                aria-label="Control room"
                className="grid h-11 w-11 place-items-center rounded-sm text-smoke transition-colors hover:bg-deck hover:text-chalk"
              >
                <Shield className="h-5 w-5" />
              </Link>
            ) : null}

            <Link href="/profile" aria-label="Your profile" className="ml-1">
              <Avatar name={user?.displayName ?? 'Player'} src={user?.avatarUrl} size={32} />
            </Link>

            <button
              type="button"
              onClick={signOut}
              aria-label="Sign out"
              className="hidden h-11 w-11 place-items-center rounded-sm text-smoke transition-colors hover:bg-deck hover:text-chalk md:grid"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className={cn('container flex-1 pt-5', bare ? 'pb-10' : 'pb-nav md:pb-14')}>
        {children}
      </main>

      {bare ? null : <BottomNav />}
    </div>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span className="grid h-7 w-7 place-items-center rounded-xs bg-volt">
        <span className="font-data text-[15px] font-black italic leading-none text-volt-ink">
          {'//'}
        </span>
      </span>
      <span className="display text-[17px] leading-none text-chalk">
        Clash<span className="text-volt">Arena</span>
      </span>
    </span>
  );
}

function NotificationBell() {
  const [open, setOpen] = React.useState(false);
  const { notifications, unread, mutate } = useNotifications();

  React.useEffect(() => {
    const socket = getSocket();
    const onNew = (notification: NotificationDTO) => {
      // These duplicate what the arena screens already announce in full type.
      // A toast over the round header at the moment a question opens is worse
      // than no toast at all.
      if (!SILENT_NOTIFICATIONS.has(notification.type)) {
        toast(notification.title, { description: notification.body ?? undefined });
      }
      void mutate();
    };
    socket.on('notification:new', onNew);
    return () => {
      socket.off('notification:new', onNew);
    };
  }, [mutate]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
        className="relative grid h-11 w-11 place-items-center rounded-sm text-smoke transition-colors hover:bg-deck hover:text-chalk"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 ? (
          <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-blaze px-1 font-data text-[9px] font-black text-volt-ink">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="absolute right-0 z-50 mt-2 w-[min(21rem,calc(100vw-2.5rem))] overflow-hidden rounded-md border border-rail bg-pit shadow-lift"
            >
              <div className="flex items-center justify-between border-b border-rail px-4 py-3">
                <Kicker>Dispatches</Kicker>
                {unread > 0 ? (
                  <button
                    onClick={async () => {
                      await api.patch('/api/notifications', {});
                      void mutate();
                    }}
                    className="font-data text-[10px] font-bold uppercase tracking-[0.12em] text-volt hover:underline"
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              <div className="max-h-[22rem] overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-4 py-10 text-center text-[13px] text-ghost">
                    Nothing yet. Join a tournament to get started.
                  </p>
                ) : (
                  notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={cn(
                        'border-b border-rail/60 px-4 py-3 last:border-0',
                        !notification.readAt && 'bg-volt/5',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-semibold text-chalk">{notification.title}</p>
                        {!notification.readAt ? <Tag tone="volt">New</Tag> : null}
                      </div>
                      {notification.body ? (
                        <p className="mt-1 text-[12px] leading-snug text-smoke">
                          {notification.body}
                        </p>
                      ) : null}
                      <p className="mt-1.5 font-data text-[10px] uppercase tracking-[0.1em] text-ghost">
                        {formatRelative(notification.createdAt)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
