import { Prisma } from '@prisma/client';
import { prisma, type Tx } from '../db';
import type { TournamentEventType } from '../realtime/events';

/**
 * Audit trail. Every privileged action and every state transition lands here,
 * which is what makes a disputed result reconstructable after the fact.
 */
export async function logTournamentEvent(
  input: {
    tournamentId: string;
    type: TournamentEventType | string;
    actorId?: string | null;
    payload?: Record<string, unknown> | null;
  },
  client: Tx = prisma,
): Promise<void> {
  await client.tournamentEvent.create({
    data: {
      tournamentId: input.tournamentId,
      type: input.type,
      actorId: input.actorId ?? null,
      payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function listTournamentEvents(tournamentId: string, limit = 100) {
  return prisma.tournamentEvent.findMany({
    where: { tournamentId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { actor: { select: { id: true, username: true, displayName: true } } },
  });
}
