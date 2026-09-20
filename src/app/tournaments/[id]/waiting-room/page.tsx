'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { AnimatePresence, motion } from 'framer-motion';
import { AppShell } from '@/components/layout/app-shell';
import {
  Display,
  Kicker,
  LoadingState,
  Numeral,
  Skeleton,
  Tag,
} from '@/components/ui/primitives';
import { Avatar } from '@/components/ui/primitives';
import { CodePlate, SignalDot } from '@/components/tournament/poster';
import { fetcher } from '@/lib/client/api';
import { useSession } from '@/lib/client/hooks';
import { useSocketEvent, useTournamentSocket } from '@/lib/client/socket';
import { cn } from '@/lib/utils';
import type { LiveTournamentStateDTO, WaitingRoomParticipantDTO } from '@/types';

interface WaitingRoomResponse {
  participants: WaitingRoomParticipantDTO[];
  state: LiveTournamentStateDTO;
}

/** Newest arrivals, shown as a short live feed. */
interface Arrival {
  id: string;
  name: string;
}

export default function LobbyPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSession();

  const { data, isLoading, mutate } = useSWR<WaitingRoomResponse>(
    `/api/tournaments/${params.id}/waiting-room`,
    fetcher,
    { refreshInterval: 20_000 },
  );

  const [state, setState] = React.useState<LiveTournamentStateDTO | null>(null);
  const [arrivals, setArrivals] = React.useState<Arrival[]>([]);

  const { socket, connected, error } = useTournamentSocket(params.id, { onState: setState });
  const live = state ?? data?.state ?? null;

  useSocketEvent(socket, 'tournament:started', () => {
    // No toast: the arena floor announces the round in full type a beat later,
    // and a toast would land on top of the clock.
    router.push(`/tournaments/${params.id}/play`);
  });

  useSocketEvent(socket, 'question:started', () => {
    router.push(`/tournaments/${params.id}/play`);
  });

  useSocketEvent(socket, 'tournament:joined', (payload) => {
    setArrivals((previous) =>
      [{ id: payload.participant.participantId, name: payload.participant.displayName }, ...previous].slice(0, 4),
    );
    setState((previous) =>
      previous ? { ...previous, participantCount: payload.participantCount } : previous,
    );
    void mutate();
  });

  useSocketEvent(socket, 'tournament:participantUpdated', () => void mutate());

  useSocketEvent(socket, 'presence:update', (payload) => {
    setState((previous) =>
      previous
        ? {
            ...previous,
            connectedCount: payload.connectedCount,
            participantCount: payload.participantCount || previous.participantCount,
          }
        : previous,
    );
  });

  // Never strand a player in a lobby for something already running or over.
  React.useEffect(() => {
    if (!live) return;
    if (live.status === 'LIVE' || live.status === 'PAUSED') {
      router.replace(`/tournaments/${params.id}/play`);
    } else if (live.status === 'FINISHED' || live.status === 'ARCHIVED') {
      router.replace(`/tournaments/${params.id}/result`);
    }
  }, [live, params.id, router]);

  const participants = data?.participants ?? [];
  const me = participants.find((participant) => participant.id === user?.id);

  if (isLoading || !live) {
    return (
      <AppShell bare>
        <LoadingState message="Entering the lobby" />
      </AppShell>
    );
  }

  return (
    <AppShell bare>
      <div className="relative mx-auto max-w-lg">
        <div className="pointer-events-none absolute inset-x-0 -top-8 h-72 grid-field" aria-hidden />

        {/* --- status strip ------------------------------------------- */}
        <div className="relative flex items-center justify-between">
          <CodePlate code={live.code} size="sm" />
          <SignalDot connected={connected} />
        </div>

        {/* --- the headline ------------------------------------------- */}
        <div className="relative mt-8 text-center">
          <Kicker tone="volt">Round 01 · {live.questionCount} rounds</Kicker>
          <Display size="mega" as="h1" className="mt-2">
            Get
            <br />
            ready
          </Display>
          <p className="mt-4 font-data text-[14px] font-bold uppercase tracking-[0.1em] text-smoke">
            {live.name}
          </p>
        </div>

        {me?.status === 'PENDING' ? (
          <div className="relative mt-6 rounded-md border border-flag/40 bg-flag/5 p-4 text-center">
            <Kicker tone="chalk">Awaiting approval</Kicker>
            <p className="mt-1.5 text-[13px] text-smoke">
              The host still has to wave you through. Keep this screen open.
            </p>
          </div>
        ) : null}

        {/* --- the count ---------------------------------------------- */}
        <div className="relative mt-10 flex items-end justify-center gap-10">
          <Numeral
            value={live.participantCount}
            label="Players in"
            size="hero"
            align="center"
            tone="chalk"
          />
          <div className="mb-3">
            <Numeral
              value={live.connectedCount}
              label="On screen"
              size="lg"
              align="center"
              tone="volt"
            />
          </div>
        </div>

        {/* --- waiting pulse ------------------------------------------ */}
        <div className="relative mt-10 flex flex-col items-center gap-3">
          <div className="flex gap-2" aria-hidden>
            {[0, 1, 2, 3, 4].map((index) => (
              <motion.span
                key={index}
                className="h-2.5 w-2.5 rounded-full bg-volt"
                animate={{ opacity: [0.2, 1, 0.2], y: [0, -5, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: index * 0.12 }}
              />
            ))}
          </div>
          <Kicker aria-live="polite">The host opens the arena</Kicker>
          {error ? (
            <p className="text-center text-[12px] text-blaze">
              Connection interrupted. Reconnecting you to the arena.
            </p>
          ) : null}
        </div>

        {/* --- arrivals feed ------------------------------------------ */}
        <div className="relative mt-10 min-h-[3.5rem]">
          <AnimatePresence initial={false}>
            {arrivals.map((arrival, index) => (
              <motion.p
                key={arrival.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1 - index * 0.28, x: 0 }}
                exit={{ opacity: 0 }}
                className="text-center font-data text-[12px] font-bold uppercase tracking-[0.1em] text-volt"
              >
                + {arrival.name} joined
              </motion.p>
            ))}
          </AnimatePresence>
        </div>

        {/* --- the roster --------------------------------------------- */}
        <section className="relative mt-8">
          <div className="mb-3 flex items-center justify-between">
            <Kicker>In the lobby</Kicker>
            <Tag tone="volt">{participants.length}</Tag>
          </div>

          {participants.length === 0 ? (
            <Skeleton className="h-20" />
          ) : (
            <div className="flex flex-wrap gap-2">
              <AnimatePresence initial={false}>
                {participants.map((participant) => (
                  <motion.div
                    key={participant.participantId}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: 'spring', stiffness: 340, damping: 26 }}
                    className={cn(
                      'flex items-center gap-2 rounded-sm border px-2.5 py-1.5',
                      participant.id === user?.id
                        ? 'border-volt bg-volt/10'
                        : 'border-rail bg-deck',
                    )}
                    title={participant.connected ? 'Connected' : 'Offline'}
                  >
                    <Avatar name={participant.displayName} src={participant.avatarUrl} size={22} />
                    <span className="font-data text-[12px] font-bold text-chalk">
                      {participant.displayName}
                    </span>
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        participant.status === 'PENDING'
                          ? 'bg-flag'
                          : participant.connected
                            ? 'bg-win'
                            : 'bg-ghost',
                      )}
                      aria-hidden
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
