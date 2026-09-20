import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { emitToUser } from '../realtime/server';
import { NOTIFICATION_TYPE, notifyUser } from './notification-service';
import type { BadgeDTO } from '@/types';

/**
 * Gamification layer. Badges are evaluated at three moments - after a graded
 * answer, when a question closes, and when the tournament ends - so the rules
 * stay readable and cheap. Awards are idempotent thanks to the unique index on
 * (userId, badgeId, tournamentId).
 */

export const BADGE = {
  FIRST_BLOOD: 'FIRST_BLOOD',
  SPEED_DEMON: 'SPEED_DEMON',
  STREAK_MASTER: 'STREAK_MASTER',
  PERFECT_ROUND: 'PERFECT_ROUND',
  COMEBACK_KING: 'COMEBACK_KING',
  CHAMPION: 'CHAMPION',
  PODIUM: 'PODIUM',
} as const;

export type BadgeCode = (typeof BADGE)[keyof typeof BADGE];

export const BADGE_DEFINITIONS: Array<BadgeDTO & { code: BadgeCode }> = [
  {
    code: BADGE.FIRST_BLOOD,
    name: 'First Blood',
    description: 'First player to answer a question correctly.',
    icon: '🥇',
    color: '#FFC93C',
  },
  {
    code: BADGE.SPEED_DEMON,
    name: 'Speed Demon',
    description: 'Correct answer inside the first 15% of the clock.',
    icon: '⚡',
    color: '#38BDF8',
  },
  {
    code: BADGE.STREAK_MASTER,
    name: 'Streak Master',
    description: 'Five correct answers in a row.',
    icon: '🔥',
    color: '#FB7185',
  },
  {
    code: BADGE.PERFECT_ROUND,
    name: 'Perfect Round',
    description: 'Every question answered correctly.',
    icon: '💯',
    color: '#34D399',
  },
  {
    code: BADGE.COMEBACK_KING,
    name: 'Comeback King',
    description: 'Climbed five or more places on a single question.',
    icon: '🚀',
    color: '#A78BFA',
  },
  {
    code: BADGE.CHAMPION,
    name: 'Champion',
    description: 'Won a tournament outright.',
    icon: '🏆',
    color: '#FFC93C',
  },
  {
    code: BADGE.PODIUM,
    name: 'Podium Finish',
    description: 'Finished in the top three.',
    icon: '🏅',
    color: '#C9D6E4',
  },
];

/** Idempotent upsert of the badge catalogue. Safe to call on every boot. */
export async function ensureBadgeCatalogue(): Promise<void> {
  for (const badge of BADGE_DEFINITIONS) {
    await prisma.badge.upsert({
      where: { code: badge.code },
      update: {
        name: badge.name,
        description: badge.description,
        icon: badge.icon,
        color: badge.color,
      },
      create: badge,
    });
  }
}

const catalogueCache = new Map<string, { id: string; dto: BadgeDTO }>();

async function badgeByCode(code: BadgeCode) {
  const cached = catalogueCache.get(code);
  if (cached) return cached;

  let row = await prisma.badge.findUnique({ where: { code } });
  if (!row) {
    const definition = BADGE_DEFINITIONS.find((b) => b.code === code);
    if (!definition) return null;
    row = await prisma.badge.create({ data: definition });
  }

  const value = {
    id: row.id,
    dto: {
      code: row.code,
      name: row.name,
      description: row.description,
      icon: row.icon,
      color: row.color,
    } satisfies BadgeDTO,
  };
  catalogueCache.set(code, value);
  return value;
}

export interface AwardOptions {
  tournamentId?: string | null;
  questionId?: string | null;
  context?: Record<string, unknown>;
  /** Suppresses the notification row (used for bulk end-of-game awards). */
  silent?: boolean;
}

/** Returns the badge when it was newly awarded, null when already held. */
export async function awardBadge(
  userId: string,
  code: BadgeCode,
  options: AwardOptions = {},
): Promise<BadgeDTO | null> {
  const badge = await badgeByCode(code);
  if (!badge) return null;

  const existing = await prisma.userBadge.findFirst({
    where: { userId, badgeId: badge.id, tournamentId: options.tournamentId ?? null },
    select: { id: true },
  });
  if (existing) return null;

  try {
    await prisma.userBadge.create({
      data: {
        userId,
        badgeId: badge.id,
        tournamentId: options.tournamentId ?? null,
        questionId: options.questionId ?? null,
        context: (options.context ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return null; // Awarded concurrently - not an error.
    }
    throw error;
  }

  emitToUser(userId, 'badge:earned', {
    tournamentId: options.tournamentId ?? null,
    badge: badge.dto,
  });

  if (!options.silent) {
    await notifyUser(userId, {
      type: NOTIFICATION_TYPE.BADGE_EARNED,
      title: `${badge.dto.icon} ${badge.dto.name}`,
      body: badge.dto.description,
      data: { badgeCode: code, tournamentId: options.tournamentId ?? null },
    });
  }

  return badge.dto;
}

// ---------------------------------------------------------------------------
// Rule evaluation
// ---------------------------------------------------------------------------

export interface AnswerBadgeContext {
  userId: string;
  tournamentId: string;
  questionId: string;
  submissionId: string;
  outcome: string;
  responseTimeMs: number;
  timeLimitMs: number;
  streakAfter: number;
}

/**
 * Evaluated after a submission is graded. First Blood is resolved with an
 * ordered query rather than a counter, so two near-simultaneous correct answers
 * cannot both claim it.
 */
export async function evaluateAnswerBadges(ctx: AnswerBadgeContext): Promise<BadgeDTO[]> {
  if (ctx.outcome !== 'CORRECT') return [];

  const earned: BadgeDTO[] = [];

  const fastest = await prisma.submission.findFirst({
    where: { questionId: ctx.questionId, outcome: 'CORRECT' },
    orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });

  if (fastest?.id === ctx.submissionId) {
    const badge = await awardBadge(ctx.userId, BADGE.FIRST_BLOOD, {
      tournamentId: ctx.tournamentId,
      questionId: ctx.questionId,
      context: { responseTimeMs: ctx.responseTimeMs },
    });
    if (badge) earned.push(badge);
  }

  const speedThreshold = Math.max(1500, ctx.timeLimitMs * 0.15);
  if (ctx.responseTimeMs <= speedThreshold) {
    const badge = await awardBadge(ctx.userId, BADGE.SPEED_DEMON, {
      tournamentId: ctx.tournamentId,
      questionId: ctx.questionId,
      context: { responseTimeMs: ctx.responseTimeMs },
    });
    if (badge) earned.push(badge);
  }

  if (ctx.streakAfter >= 5) {
    const badge = await awardBadge(ctx.userId, BADGE.STREAK_MASTER, {
      tournamentId: ctx.tournamentId,
      context: { streak: ctx.streakAfter },
    });
    if (badge) earned.push(badge);
  }

  return earned;
}

export interface QuestionBadgeSubmission {
  id: string;
  userId: string;
  outcome: string;
  responseTimeMs: number;
  submittedAt: Date | string;
}

/**
 * Batch version used when a question closes. One pass over the submissions
 * decides First Blood and Speed Demon for the whole field, so a 1000-player
 * question costs a handful of writes instead of a thousand queries.
 *
 * Badges are evaluated at close time rather than at submit time on purpose: an
 * earlier award would tell a player their answer was right while the question
 * is still open.
 */
export async function evaluateQuestionBadges(params: {
  tournamentId: string;
  questionId: string;
  timeLimitMs: number;
  submissions: QuestionBadgeSubmission[];
  streakByUser: Map<string, number>;
}): Promise<void> {
  const correct = params.submissions
    .filter((s) => s.outcome === 'CORRECT')
    .sort((a, b) => {
      const at = new Date(a.submittedAt).getTime();
      const bt = new Date(b.submittedAt).getTime();
      return at === bt ? a.id.localeCompare(b.id) : at - bt;
    });

  if (correct.length) {
    const winner = correct[0];
    await awardBadge(winner.userId, BADGE.FIRST_BLOOD, {
      tournamentId: params.tournamentId,
      questionId: params.questionId,
      context: { responseTimeMs: winner.responseTimeMs },
    });
  }

  const speedThreshold = Math.max(1500, params.timeLimitMs * 0.15);
  for (const submission of correct) {
    if (submission.responseTimeMs <= speedThreshold) {
      await awardBadge(submission.userId, BADGE.SPEED_DEMON, {
        tournamentId: params.tournamentId,
        questionId: params.questionId,
        context: { responseTimeMs: submission.responseTimeMs },
      });
    }

    const streak = params.streakByUser.get(submission.userId) ?? 0;
    if (streak >= 5) {
      await awardBadge(submission.userId, BADGE.STREAK_MASTER, {
        tournamentId: params.tournamentId,
        context: { streak },
      });
    }
  }
}

/** Climbing five or more places on one question earns the comeback badge. */
export async function evaluateComebackBadges(
  tournamentId: string,
  movements: Array<{ userId: string; rank: number; previousRank: number | null }>,
): Promise<void> {
  for (const movement of movements) {
    if (movement.previousRank === null) continue;
    const climbed = movement.previousRank - movement.rank;
    if (climbed >= 5) {
      await awardBadge(movement.userId, BADGE.COMEBACK_KING, {
        tournamentId,
        context: { from: movement.previousRank, to: movement.rank, climbed },
      });
    }
  }
}

export async function evaluateTournamentEndBadges(
  tournamentId: string,
  standings: Array<{ userId: string; rank: number; correctCount: number }>,
  totalQuestions: number,
): Promise<void> {
  for (const entry of standings) {
    if (entry.rank === 1) {
      await awardBadge(entry.userId, BADGE.CHAMPION, { tournamentId, context: { rank: entry.rank } });
    }
    if (entry.rank <= 3) {
      await awardBadge(entry.userId, BADGE.PODIUM, { tournamentId, context: { rank: entry.rank } });
    }
    if (totalQuestions > 0 && entry.correctCount === totalQuestions) {
      await awardBadge(entry.userId, BADGE.PERFECT_ROUND, {
        tournamentId,
        context: { correctCount: entry.correctCount },
      });
    }
  }
}

export async function listUserBadges(userId: string, tournamentId?: string) {
  const rows = await prisma.userBadge.findMany({
    where: { userId, ...(tournamentId ? { tournamentId } : {}) },
    include: { badge: true },
    orderBy: { awardedAt: 'desc' },
  });

  return rows.map((row) => ({
    code: row.badge.code,
    name: row.badge.name,
    description: row.badge.description,
    icon: row.badge.icon,
    color: row.badge.color,
    awardedAt: row.awardedAt.toISOString(),
    tournamentId: row.tournamentId,
    context: row.context as Record<string, unknown> | null,
  }));
}
