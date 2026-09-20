'use client';

import * as React from 'react';
import useSWR from 'swr';
import { fetcher } from './api';
import type { NotificationDTO, SessionUserDTO } from '@/types';

/** Signed-in user plus the unread notification count for the bell. */
export function useSession() {
  const { data, error, isLoading, mutate } = useSWR<{
    user: SessionUserDTO | null;
    unreadNotifications: number;
  }>('/api/auth/me', fetcher, { revalidateOnFocus: false });

  return {
    user: data?.user ?? null,
    unread: data?.unreadNotifications ?? 0,
    isLoading,
    error,
    mutate,
  };
}

export function useNotifications(enabled = true) {
  const { data, mutate, isLoading } = useSWR<{
    notifications: NotificationDTO[];
    unread: number;
  }>(enabled ? '/api/notifications?limit=25' : null, fetcher, { revalidateOnFocus: true });

  return {
    notifications: data?.notifications ?? [],
    unread: data?.unread ?? 0,
    isLoading,
    mutate,
  };
}

/**
 * Countdown rendered from an absolute server deadline plus the measured clock
 * offset. This is display only: the server independently rejects anything that
 * arrives after the deadline.
 */
export function useCountdown(
  endsAt: string | null | undefined,
  clockOffsetMs = 0,
  options: { paused?: boolean } = {},
) {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!endsAt || options.paused) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [endsAt, options.paused]);

  if (!endsAt) {
    return { msRemaining: 0, secondsRemaining: 0, expired: false, active: false };
  }

  const deadline = new Date(endsAt).getTime();
  const msRemaining = Math.max(0, deadline - (now + clockOffsetMs));

  return {
    msRemaining,
    secondsRemaining: Math.ceil(msRemaining / 1000),
    expired: msRemaining <= 0,
    active: true,
  };
}

/** Local storage backed state that tolerates private browsing. */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = React.useState<T>(initial);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      /* ignore */
    }
  }, [key]);

  const update = React.useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [key],
  );

  return [value, update] as const;
}
