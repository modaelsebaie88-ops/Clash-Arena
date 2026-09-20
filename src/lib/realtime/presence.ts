/**
 * Who is currently connected to which tournament.
 *
 * Socket.IO room sizes count sockets, not people - one player with two tabs
 * would be counted twice and the host would be counted as a player. This
 * registry tracks unique users per tournament and keeps roles apart.
 *
 * State lives on globalThis because the Next.js request handlers and the
 * websocket server are bundled separately inside the same Node process.
 */

type Role = 'ADMIN' | 'PARTICIPANT';

interface TournamentPresence {
  /** userId -> number of open sockets */
  participants: Map<string, number>;
  hosts: Map<string, number>;
}

const globalForPresence = globalThis as unknown as {
  __clashArenaPresence?: Map<string, TournamentPresence>;
};

function registry(): Map<string, TournamentPresence> {
  if (!globalForPresence.__clashArenaPresence) {
    globalForPresence.__clashArenaPresence = new Map();
  }
  return globalForPresence.__clashArenaPresence;
}

function bucketFor(tournamentId: string): TournamentPresence {
  const map = registry();
  let bucket = map.get(tournamentId);
  if (!bucket) {
    bucket = { participants: new Map(), hosts: new Map() };
    map.set(tournamentId, bucket);
  }
  return bucket;
}

export function addPresence(tournamentId: string, userId: string, role: Role): void {
  const bucket = bucketFor(tournamentId);
  const target = role === 'ADMIN' ? bucket.hosts : bucket.participants;
  target.set(userId, (target.get(userId) ?? 0) + 1);
}

export function removePresence(tournamentId: string, userId: string, role: Role): void {
  const bucket = registry().get(tournamentId);
  if (!bucket) return;
  const target = role === 'ADMIN' ? bucket.hosts : bucket.participants;
  const next = (target.get(userId) ?? 0) - 1;
  if (next <= 0) target.delete(userId);
  else target.set(userId, next);

  if (bucket.participants.size === 0 && bucket.hosts.size === 0) {
    registry().delete(tournamentId);
  }
}

export function connectedParticipantCount(tournamentId: string): number {
  return registry().get(tournamentId)?.participants.size ?? 0;
}

export function connectedParticipantIds(tournamentId: string): string[] {
  return Array.from(registry().get(tournamentId)?.participants.keys() ?? []);
}

export function isUserConnected(tournamentId: string, userId: string): boolean {
  const bucket = registry().get(tournamentId);
  return Boolean(bucket?.participants.has(userId) || bucket?.hosts.has(userId));
}

export function clearPresence(tournamentId: string): void {
  registry().delete(tournamentId);
}
