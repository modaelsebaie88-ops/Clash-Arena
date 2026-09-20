import type { Server } from 'socket.io';
import { ROOM, type ClientToServerEvents, type ServerToClientEvents, type SocketData } from './events';

/**
 * Accessor for the Socket.IO server instance created in server.ts.
 *
 * Next.js bundles route handlers separately from the custom server, so a plain
 * module-level variable would give each graph its own copy. Parking the
 * instance on globalThis is what lets an API route broadcast to sockets.
 */

export type ArenaServer = Server<ClientToServerEvents, ServerToClientEvents, ServerToClientEvents, SocketData>;

const globalForIO = globalThis as unknown as { __clashArenaIO?: ArenaServer };

export function setIO(io: ArenaServer): void {
  globalForIO.__clashArenaIO = io;
}

export function getIO(): ArenaServer | null {
  return globalForIO.__clashArenaIO ?? null;
}

type EventName = keyof ServerToClientEvents;

/** Broadcast to every socket watching a tournament (players and host). */
export function emitToTournament<E extends EventName>(
  tournamentId: string,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
): void {
  getIO()?.to(ROOM.tournament(tournamentId)).emit(event, ...(args as never));
}

/** Host-only channel: live stats that players must not see mid-question. */
export function emitToHost<E extends EventName>(
  tournamentId: string,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
): void {
  getIO()?.to(ROOM.host(tournamentId)).emit(event, ...(args as never));
}

/** Private channel for one person: personal results, badges, notifications. */
export function emitToUser<E extends EventName>(
  userId: string,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
): void {
  getIO()?.to(ROOM.user(userId)).emit(event, ...(args as never));
}
