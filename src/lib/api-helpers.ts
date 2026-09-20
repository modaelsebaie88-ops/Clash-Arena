import { ApiError, assertTrustedOrigin, route } from './http';
import { requireAdmin, requireUser, type SessionUser } from './auth/session';
import { getTournamentOrThrow } from './services/tournament-service';
import { prisma } from './db';
import type { Tournament } from '@prisma/client';

/**
 * Wraps a route handler with the standard error envelope and the CSRF origin
 * check. Every mutating endpoint in the app goes through this.
 */
export function apiRoute(request: Request, handler: () => Promise<Response>) {
  return route(async () => {
    assertTrustedOrigin(request);
    return handler();
  });
}

/**
 * Tournament management is scoped to the host who created it. An admin account
 * is not automatically allowed to reach into someone else's tournament, which
 * keeps the blast radius of a compromised admin session small.
 */
export async function requireTournamentHost(
  tournamentId: string,
): Promise<{ user: SessionUser; tournament: Tournament }> {
  const user = await requireAdmin();
  const tournament = await getTournamentOrThrow(tournamentId);
  if (tournament.hostId !== user.id) {
    throw ApiError.forbidden('You are not the host of this tournament.');
  }
  return { user, tournament };
}

/** Read access: the host, or any player who joined. */
export async function requireTournamentViewer(
  tournamentId: string,
): Promise<{ user: SessionUser; tournament: Tournament; isHost: boolean }> {
  const user = await requireUser();
  const tournament = await getTournamentOrThrow(tournamentId);
  const isHost = tournament.hostId === user.id;

  if (!isHost) {
    const participant = await prisma.tournamentParticipant.findUnique({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: user.id } },
      select: { id: true },
    });
    const isPublic = ['REGISTRATION_OPEN', 'WAITING', 'LIVE', 'PAUSED', 'FINISHED'].includes(
      tournament.status,
    );
    if (!participant && !isPublic) throw ApiError.forbidden();
  }

  return { user, tournament, isHost };
}

export function parsePagination(request: Request, defaults = { limit: 50, offset: 0 }) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit') ?? defaults.limit);
  const offset = Number(url.searchParams.get('offset') ?? defaults.offset);
  return {
    limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : defaults.limit,
    offset: Number.isFinite(offset) ? Math.max(offset, 0) : defaults.offset,
  };
}
