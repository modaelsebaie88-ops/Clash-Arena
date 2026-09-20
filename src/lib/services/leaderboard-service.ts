import { Prisma } from '@prisma/client';
import { prisma, type Tx } from '../db';
import { cacheKeys, getCache } from '../cache';
import type { LeaderboardDTO, LeaderboardEntryDTO, TieBreakerKey } from '@/types';

/**
 * Ranking rules.
 *
 * Standings are derived from the denormalised aggregates on
 * TournamentParticipant, which are written inside the same transaction as each
 * submission. One indexed query returns every row; ordering happens in memory
 * because tie-breaks are configurable per tournament.
 *
 * At the scale this project targets (thousands of players per tournament) that
 * is a sub-10ms operation, and ranks are only recomputed when a question
 * closes - not on every individual submission. If a tournament ever needs to be
 * bigger than a single node's memory, swap this for a Redis sorted set: the
 * public surface of this module is the seam for that change.
 */

export const DEFAULT_TIE_BREAKERS: TieBreakerKey[] = [
  'TOTAL_POINTS',
  'CORRECT_COUNT',
  'TOTAL_RESPONSE_TIME',
  'EARLIEST_LAST_SUBMISSION',
];

const VALID_TIE_BREAKERS = new Set<TieBreakerKey>([
  'TOTAL_POINTS',
  'CORRECT_COUNT',
  'TOTAL_RESPONSE_TIME',
  'EARLIEST_LAST_SUBMISSION',
  'BEST_STREAK',
]);

export function parseTieBreakers(raw: unknown): TieBreakerKey[] {
  if (!Array.isArray(raw)) return DEFAULT_TIE_BREAKERS;
  const keys = raw.filter((k): k is TieBreakerKey => VALID_TIE_BREAKERS.has(k as TieBreakerKey));
  return keys.length ? keys : DEFAULT_TIE_BREAKERS;
}

/** Everything the ranking comparator needs; keeps the sort independent of Prisma. */
export interface RankableParticipant {
  participantId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: 'PENDING' | 'ACTIVE' | 'DISQUALIFIED';
  totalPoints: number;
  answeredCount: number;
  correctCount: number;
  wrongCount: number;
  totalResponseTimeMs: number;
  fastestResponseMs: number | null;
  currentStreak: number;
  bestStreak: number;
  bestRank: number | null;
  previousRank: number | null;
  lastSubmissionAt: Date | string | null;
}

function toMillis(value: Date | string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  return typeof value === 'string' ? new Date(value).getTime() : value.getTime();
}

/** Returns < 0 when `a` outranks `b`. Pure and fully unit-tested. */
export function compareParticipants(
  a: RankableParticipant,
  b: RankableParticipant,
  tieBreakers: TieBreakerKey[] = DEFAULT_TIE_BREAKERS,
): number {
  // Disqualified players always sink to the bottom regardless of points.
  if (a.status === 'DISQUALIFIED' && b.status !== 'DISQUALIFIED') return 1;
  if (b.status === 'DISQUALIFIED' && a.status !== 'DISQUALIFIED') return -1;

  for (const key of tieBreakers) {
    switch (key) {
      case 'TOTAL_POINTS': {
        if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
        break;
      }
      case 'CORRECT_COUNT': {
        if (a.correctCount !== b.correctCount) return b.correctCount - a.correctCount;
        break;
      }
      case 'TOTAL_RESPONSE_TIME': {
        if (a.totalResponseTimeMs !== b.totalResponseTimeMs) {
          return a.totalResponseTimeMs - b.totalResponseTimeMs;
        }
        break;
      }
      case 'EARLIEST_LAST_SUBMISSION': {
        const aTime = toMillis(a.lastSubmissionAt);
        const bTime = toMillis(b.lastSubmissionAt);
        if (aTime !== bTime) return aTime - bTime;
        break;
      }
      case 'BEST_STREAK': {
        if (a.bestStreak !== b.bestStreak) return b.bestStreak - a.bestStreak;
        break;
      }
      default:
        break;
    }
  }

  // Deterministic final fallback so ordering never flickers between reads.
  return a.participantId.localeCompare(b.participantId);
}

function averageResponse(p: RankableParticipant): number | null {
  return p.answeredCount > 0 ? Math.round(p.totalResponseTimeMs / p.answeredCount) : null;
}

/**
 * Sorts and assigns ranks. Players tied on every configured tie-break share a
 * rank, and the following rank skips accordingly (1, 2, 2, 4).
 */
export function rankParticipants(
  participants: RankableParticipant[],
  tieBreakers: TieBreakerKey[] = DEFAULT_TIE_BREAKERS,
): LeaderboardEntryDTO[] {
  const sorted = [...participants].sort((a, b) => compareParticipants(a, b, tieBreakers));

  const entries: LeaderboardEntryDTO[] = [];
  let lastRank = 0;
  let previousRow: RankableParticipant | null = null;

  sorted.forEach((row, index) => {
    const tiedWithPrevious =
      previousRow !== null && compareParticipantsIgnoringId(previousRow, row, tieBreakers) === 0;
    const rank = tiedWithPrevious ? lastRank : index + 1;
    lastRank = rank;
    previousRow = row;

    entries.push({
      participantId: row.participantId,
      userId: row.userId,
      username: row.username,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      rank,
      previousRank: row.previousRank,
      rankDelta: row.previousRank === null ? null : row.previousRank - rank,
      totalPoints: row.totalPoints,
      answeredCount: row.answeredCount,
      correctCount: row.correctCount,
      wrongCount: row.wrongCount,
      averageResponseMs: averageResponse(row),
      fastestResponseMs: row.fastestResponseMs,
      currentStreak: row.currentStreak,
      bestStreak: row.bestStreak,
      status: row.status,
    });
  });

  return entries;
}

/** Same comparator without the id fallback, so genuine ties can be detected. */
function compareParticipantsIgnoringId(
  a: RankableParticipant,
  b: RankableParticipant,
  tieBreakers: TieBreakerKey[],
): number {
  const clone = (p: RankableParticipant) => ({ ...p, participantId: 'x' });
  return compareParticipants(clone(a), clone(b), tieBreakers);
}

type ParticipantRow = Prisma.TournamentParticipantGetPayload<{
  include: { user: { select: { id: true; username: true; displayName: true; avatarUrl: true } } };
}>;

export function toRankable(row: ParticipantRow): RankableParticipant {
  return {
    participantId: row.id,
    userId: row.userId,
    username: row.user.username,
    displayName: row.user.displayName,
    avatarUrl: row.user.avatarUrl,
    status: row.status,
    totalPoints: row.totalPoints,
    answeredCount: row.answeredCount,
    correctCount: row.correctCount,
    wrongCount: row.wrongCount,
    totalResponseTimeMs: row.totalResponseTimeMs,
    fastestResponseMs: row.fastestResponseMs,
    currentStreak: row.currentStreak,
    bestStreak: row.bestStreak,
    bestRank: row.bestRank,
    previousRank: row.previousRank,
    lastSubmissionAt: row.lastSubmissionAt,
  };
}

async function loadRankable(tournamentId: string, client: Tx = prisma) {
  const rows = await client.tournamentParticipant.findMany({
    where: { tournamentId, status: { not: 'PENDING' } },
    include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
  });
  return rows.map(toRankable);
}

const LEADERBOARD_TTL_SECONDS = 30;

export interface LeaderboardQuery {
  limit?: number;
  offset?: number;
  /** Always include this participant's row, wherever they sit. */
  includeUserId?: string;
}

export async function computeStandings(
  tournamentId: string,
  tieBreakers?: TieBreakerKey[],
  client: Tx = prisma,
): Promise<LeaderboardEntryDTO[]> {
  const [participants, tournament] = await Promise.all([
    loadRankable(tournamentId, client),
    tieBreakers
      ? Promise.resolve(null)
      : client.tournament.findUnique({ where: { id: tournamentId }, select: { tieBreakers: true } }),
  ]);
  const keys = tieBreakers ?? parseTieBreakers(tournament?.tieBreakers);
  return rankParticipants(participants, keys);
}

/** Cached full standings for a tournament. */
export async function getStandings(tournamentId: string): Promise<LeaderboardEntryDTO[]> {
  const cache = getCache();
  const key = cacheKeys.leaderboard(tournamentId);
  const cached = await cache.get<LeaderboardEntryDTO[]>(key);
  if (cached) return cached;

  const entries = await computeStandings(tournamentId);
  await cache.set(key, entries, LEADERBOARD_TTL_SECONDS);
  return entries;
}

export async function invalidateLeaderboard(tournamentId: string): Promise<void> {
  await getCache().del(cacheKeys.leaderboard(tournamentId));
}

export async function getLeaderboard(
  tournamentId: string,
  query: LeaderboardQuery = {},
): Promise<LeaderboardDTO> {
  const all = await getStandings(tournamentId);
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 500);
  const offset = Math.max(query.offset ?? 0, 0);

  const page = all.slice(offset, offset + limit);

  if (query.includeUserId && !page.some((entry) => entry.userId === query.includeUserId)) {
    const own = all.find((entry) => entry.userId === query.includeUserId);
    if (own) page.push(own);
  }

  return {
    tournamentId,
    entries: page,
    total: all.length,
    updatedAt: new Date().toISOString(),
    questionOrder: null,
  };
}

export async function getParticipantStanding(
  tournamentId: string,
  userId: string,
): Promise<LeaderboardEntryDTO | null> {
  const all = await getStandings(tournamentId);
  return all.find((entry) => entry.userId === userId) ?? null;
}

/**
 * Recomputes ranks, persists rank / previousRank / bestRank and writes a
 * snapshot. Called when a question closes and when the tournament ends - never
 * per submission, which is what keeps write amplification low.
 */
export async function refreshRanks(
  tournamentId: string,
  options: { questionId?: string | null; questionOrder?: number | null; isFinal?: boolean } = {},
): Promise<LeaderboardEntryDTO[]> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { tieBreakers: true },
  });
  const tieBreakers = parseTieBreakers(tournament?.tieBreakers);

  const participants = await loadRankable(tournamentId);
  const previousRanks = new Map(participants.map((p) => [p.participantId, p.previousRank] as const));
  void previousRanks;

  // The rank a player held before this recomputation becomes their previousRank.
  const currentRanks = await prisma.tournamentParticipant.findMany({
    where: { tournamentId },
    select: { id: true, rank: true, bestRank: true },
  });
  const rankBefore = new Map(currentRanks.map((row) => [row.id, row] as const));

  const ranked = rankParticipants(
    participants.map((p) => ({ ...p, previousRank: rankBefore.get(p.participantId)?.rank ?? null })),
    tieBreakers,
  );

  if (ranked.length) {
    const updates = ranked.map((entry) => {
      const before = rankBefore.get(entry.participantId);
      const bestRank =
        before?.bestRank === null || before?.bestRank === undefined
          ? entry.rank
          : Math.min(before.bestRank, entry.rank);
      return {
        id: entry.participantId,
        rank: entry.rank,
        previousRank: entry.previousRank,
        bestRank,
        finalRank: options.isFinal ? entry.rank : null,
      };
    });

    // One statement per batch instead of one UPDATE per player.
    const CHUNK = 500;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      const values = Prisma.join(
        chunk.map(
          (u) =>
            Prisma.sql`(${u.id}::text, ${u.rank}::int, ${u.previousRank}::int, ${u.bestRank}::int, ${u.finalRank}::int)`,
        ),
      );
      await prisma.$executeRaw`
        UPDATE "TournamentParticipant" AS p
        SET "rank" = v.rank,
            "previousRank" = v.prev,
            "bestRank" = v.best,
            "finalRank" = COALESCE(v.final, p."finalRank")
        FROM (VALUES ${values}) AS v(id, rank, prev, best, final)
        WHERE p.id = v.id
      `;
    }
  }

  await prisma.leaderboardSnapshot.create({
    data: {
      tournamentId,
      questionId: options.questionId ?? null,
      questionOrder: options.questionOrder ?? null,
      isFinal: Boolean(options.isFinal),
      standings: ranked as unknown as Prisma.InputJsonValue,
    },
  });

  await getCache().set(cacheKeys.leaderboard(tournamentId), ranked, LEADERBOARD_TTL_SECONDS);

  return ranked;
}

export async function getSnapshots(tournamentId: string) {
  return prisma.leaderboardSnapshot.findMany({
    where: { tournamentId },
    orderBy: { createdAt: 'asc' },
  });
}
