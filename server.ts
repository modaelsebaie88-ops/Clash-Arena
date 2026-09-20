/**
 * Clash Arena server.
 *
 * Next.js and Socket.IO share one Node process and one HTTP listener. That is
 * what lets an API route (for example "host started the next question") reach
 * straight into the websocket layer and fan the event out to every connected
 * player, while the tournament state itself stays in Postgres.
 *
 *   browser  <-- websocket -->  Socket.IO  --+
 *   browser  <-- HTTP ------->  Next.js API -+--> services --> Postgres
 *
 * Run with `npm run dev` (watch mode) or `npm start` (after `npm run build`).
 */
import { createServer } from 'node:http';
import { parse } from 'node:url';
import next from 'next';
import { Server } from 'socket.io';
import { loadEnvConfig } from '@next/env';
// Type-only import: erased at runtime, so it does not pull application code in
// before the environment has been loaded below.
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from './src/lib/realtime/events';

const dev = process.env.NODE_ENV !== 'production';

// Load .env before any application module is imported, because the Prisma
// client and the auth helpers read configuration as soon as they load.
loadEnvConfig(process.cwd(), dev);

async function main() {
  const [
    { SESSION_COOKIE, readCookie, verifySessionToken },
    { ROOM },
    { setIO },
    presence,
    { getLiveState },
    { reconcileLiveTournaments },
    { ensureBadgeCatalogue },
    { prisma },
  ] = await Promise.all([
    import('./src/lib/auth/tokens'),
    import('./src/lib/realtime/events'),
    import('./src/lib/realtime/server'),
    import('./src/lib/realtime/presence'),
    import('./src/lib/services/tournament-service'),
    import('./src/lib/realtime/runtime'),
    import('./src/lib/services/badge-service'),
    import('./src/lib/db'),
  ]);

  const port = Number(process.env.PORT ?? 3000);
  const hostname = process.env.HOSTNAME ?? 'localhost';

  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const httpServer = createServer((req, res) => {
    try {
      handle(req, res, parse(req.url ?? '/', true));
    } catch (error) {
      console.error('[http] request failed:', error);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  const io = new Server<ClientToServerEvents, ServerToClientEvents, ServerToClientEvents, SocketData>(
    httpServer,
    {
      path: '/api/socket',
      cors: { origin: process.env.APP_URL ?? `http://${hostname}:${port}`, credentials: true },
      // Players on flaky mobile connections should survive a short dropout.
      pingInterval: 20_000,
      pingTimeout: 25_000,
    },
  );

  // --- authentication -------------------------------------------------------
  // The same signed session cookie that protects the HTTP API also protects the
  // websocket. An unauthenticated socket never reaches a tournament room.
  io.use(async (socket, nextFn) => {
    try {
      const token = readCookie(socket.request.headers.cookie, SESSION_COOKIE);
      const claims = token ? await verifySessionToken(token) : null;
      if (!claims) return nextFn(new Error('unauthorized'));

      socket.data.userId = claims.sub;
      socket.data.role = claims.role;
      socket.data.username = claims.username;
      socket.data.displayName = claims.displayName;
      socket.data.subscribedTournamentIds = new Set<string>();
      return nextFn();
    } catch (error) {
      console.error('[socket] handshake failed:', error);
      return nextFn(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, role } = socket.data;
    socket.join(ROOM.user(userId));

    socket.on('tournament:subscribe', async ({ tournamentId }, ack) => {
      try {
        const tournament = await prisma.tournament.findUnique({
          where: { id: tournamentId },
          select: { id: true, hostId: true },
        });
        if (!tournament) {
          ack?.({ ok: false, error: 'Tournament not found.' });
          return;
        }

        const isHost = tournament.hostId === userId || role === 'ADMIN';
        const participant = isHost
          ? null
          : await prisma.tournamentParticipant.findUnique({
              where: { tournamentId_userId: { tournamentId, userId } },
              select: { status: true },
            });

        if (!isHost && !participant) {
          ack?.({ ok: false, error: 'Join the tournament before connecting to it.' });
          return;
        }
        if (!isHost && participant?.status === 'DISQUALIFIED') {
          ack?.({ ok: false, error: 'You have been removed from this tournament.' });
          return;
        }

        socket.join(ROOM.tournament(tournamentId));
        if (isHost) socket.join(ROOM.host(tournamentId));

        socket.data.subscribedTournamentIds.add(tournamentId);
        presence.addPresence(tournamentId, userId, isHost ? 'ADMIN' : 'PARTICIPANT');

        const state = await getLiveState(tournamentId, userId);
        ack?.({ ok: true, state });

        io.to(ROOM.tournament(tournamentId)).emit('presence:update', {
          tournamentId,
          connectedCount: presence.connectedParticipantCount(tournamentId),
          participantCount: state.participantCount,
        });
      } catch (error) {
        console.error('[socket] subscribe failed:', error);
        ack?.({ ok: false, error: 'Could not connect to that tournament.' });
      }
    });

    socket.on('tournament:unsubscribe', ({ tournamentId }) => {
      leaveTournament(tournamentId);
    });

    socket.on('time:sync', (ack) => {
      if (typeof ack === 'function') ack(Date.now());
    });

    socket.on('disconnect', () => {
      for (const tournamentId of Array.from(socket.data.subscribedTournamentIds)) {
        leaveTournament(tournamentId);
      }
    });

    function leaveTournament(tournamentId: string) {
      if (!socket.data.subscribedTournamentIds.has(tournamentId)) return;

      socket.leave(ROOM.tournament(tournamentId));
      socket.leave(ROOM.host(tournamentId));
      socket.data.subscribedTournamentIds.delete(tournamentId);
      presence.removePresence(tournamentId, userId, role === 'ADMIN' ? 'ADMIN' : 'PARTICIPANT');

      io.to(ROOM.tournament(tournamentId)).emit('presence:update', {
        tournamentId,
        connectedCount: presence.connectedParticipantCount(tournamentId),
        participantCount: 0,
      });
    }
  });

  setIO(io);

  // Boot housekeeping: make sure the badge catalogue exists and recover any
  // question that was still open when the process last stopped.
  await ensureBadgeCatalogue().catch((error) =>
    console.error('[boot] badge catalogue failed:', error),
  );
  await reconcileLiveTournaments().catch((error) =>
    console.error('[boot] reconcile failed:', error),
  );

  httpServer.listen(port, () => {
    console.log(`\n  Clash Arena ready on http://${hostname}:${port}`);
    console.log(`  Websocket path: /api/socket`);
    console.log(`  Mode: ${dev ? 'development' : 'production'}\n`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n[server] ${signal} received, shutting down`);
    io.close();
    httpServer.close();
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[server] failed to start:', error);
  process.exit(1);
});
