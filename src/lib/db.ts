import { PrismaClient } from '@prisma/client';

/**
 * A single Prisma client is shared by the Next.js request handlers and by the
 * Socket.IO server. Both module graphs are loaded in the same Node process but
 * are bundled separately, so the instance is parked on globalThis to guarantee
 * exactly one connection pool.
 */
const globalForPrisma = globalThis as unknown as { __clashArenaPrisma?: PrismaClient };

export const prisma =
  globalForPrisma.__clashArenaPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__clashArenaPrisma = prisma;
}

/** Transaction client type, used by services that compose inside a transaction. */
export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Locks a single row with SELECT ... FOR UPDATE so concurrent writers to the
 * same participant aggregate queue up instead of clobbering each other.
 */
export async function lockParticipantRow(tx: Tx, participantId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "TournamentParticipant" WHERE id = ${participantId} FOR UPDATE`;
}

/**
 * Exclusive lock on a tournament, taken by state transitions such as closing a
 * question. It waits for in-flight submissions (which hold a shared lock) and
 * blocks new ones until the transition commits.
 */
export async function lockTournamentRow(tx: Tx, tournamentId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Tournament" WHERE id = ${tournamentId} FOR UPDATE`;
}

/**
 * Shared lock taken by every submission. Shared locks do not block each other,
 * so a thousand players can submit concurrently, but a question close cannot
 * interleave with a submission that is already half-written.
 */
export async function lockTournamentRowShared(tx: Tx, tournamentId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Tournament" WHERE id = ${tournamentId} FOR SHARE`;
}
