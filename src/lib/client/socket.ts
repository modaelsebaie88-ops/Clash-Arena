'use client';

import * as React from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@/lib/realtime/events';
import type { LiveTournamentStateDTO } from '@/types';

export type ArenaSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socketRef: ArenaSocket | null = null;

/**
 * One socket per browser tab, shared by every component that needs it. The
 * session cookie authenticates the handshake, so there is no token to manage on
 * the client.
 */
export function getSocket(): ArenaSocket {
  if (!socketRef) {
    socketRef = io({
      path: '/api/socket',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    });
  }
  return socketRef;
}

export interface TournamentSocketState {
  socket: ArenaSocket;
  connected: boolean;
  /** serverTime - clientTime, in ms. Added to local clocks to stay in step. */
  clockOffsetMs: number;
  error: string | null;
  lastState: LiveTournamentStateDTO | null;
}

/**
 * Subscribes to a tournament room and keeps a clock offset in sync.
 *
 * The offset matters: a browser clock can be minutes off, and the countdown is
 * rendered from an absolute server deadline. Measuring the offset (and halving
 * the round trip) keeps every player's clock showing the same number.
 */
export function useTournamentSocket(
  tournamentId: string | null,
  options: {
    onState?: (state: LiveTournamentStateDTO) => void;
    enabled?: boolean;
  } = {},
): TournamentSocketState {
  const { onState, enabled = true } = options;

  const [connected, setConnected] = React.useState(false);
  const [clockOffsetMs, setClockOffsetMs] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [lastState, setLastState] = React.useState<LiveTournamentStateDTO | null>(null);

  const onStateRef = React.useRef(onState);
  onStateRef.current = onState;

  const socket = React.useMemo(() => getSocket(), []);

  React.useEffect(() => {
    if (!tournamentId || !enabled) return;

    let cancelled = false;

    const syncClock = () => {
      const sentAt = Date.now();
      socket.emit('time:sync', (serverNow: number) => {
        if (cancelled) return;
        const roundTrip = Date.now() - sentAt;
        setClockOffsetMs(serverNow + roundTrip / 2 - Date.now());
      });
    };

    const subscribe = () => {
      socket.emit('tournament:subscribe', { tournamentId }, (result) => {
        if (cancelled) return;
        if (!result?.ok) {
          setError(result?.error ?? 'Could not join the live tournament.');
          return;
        }
        setError(null);
        if (result.state) {
          setLastState(result.state);
          onStateRef.current?.(result.state);
        }
        syncClock();
      });
    };

    const handleConnect = () => {
      setConnected(true);
      subscribe();
    };
    const handleDisconnect = () => setConnected(false);
    const handleConnectError = () =>
      setError('Live connection unavailable. Retrying automatically.');

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);

    if (socket.connected) handleConnect();
    else socket.connect();

    // Re-measure the offset periodically so long sessions cannot drift.
    const interval = window.setInterval(syncClock, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.emit('tournament:unsubscribe', { tournamentId });
    };
  }, [socket, tournamentId, enabled]);

  return { socket, connected, clockOffsetMs, error, lastState };
}

/** Subscribes to one server event for the lifetime of a component. */
export function useSocketEvent<E extends keyof ServerToClientEvents>(
  socket: ArenaSocket,
  event: E,
  handler: ServerToClientEvents[E],
): void {
  const handlerRef = React.useRef(handler);
  handlerRef.current = handler;

  React.useEffect(() => {
    const listener = ((...args: unknown[]) => {
      (handlerRef.current as (...a: unknown[]) => void)(...args);
    }) as ServerToClientEvents[E];

    socket.on(event, listener as never);
    return () => {
      socket.off(event, listener as never);
    };
  }, [socket, event]);
}
