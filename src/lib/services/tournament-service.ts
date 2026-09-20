import { Prisma, type Tournament, type TournamentStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma, lockTournamentRow, type Tx } from '../db';
import { ApiError } from '../http';
import { generateTournamentCode, normaliseCode } from '../utils';
import { TOURNAMENT_EVENT } from '../realtime/events';
import { emitToHost, emitToTournament, emitToUser } from '../realtime/server';
import { connectedParticipantCount } from '../realtime/presence';
import { cancelQuestionTimer, scheduleQuestionClose } from '../realtime/runtime';
import { logTournamentEvent } from './event-log-service';
import {
  buildReveal,
  listQuestions,
  toParticipantQuestion,
  type QuestionWithOptions,
} from './question-service';
import {
  getLeaderboard,
  invalidateLeaderboard,
  refreshRanks,
} from './leaderboard-service';
import { DEFAULT_SCORING_CONFIG, parseScoringConfig, scoringConfigSchema } from './scoring-service';
import { DEFAULT_TIE_BREAKERS } from './leaderboard-service';
import {
  evaluateComebackBadges,
  evaluateQuestionBadges,
  evaluateTournamentEndBadges,
} from './badge-service';
import { NOTIFICATION_TYPE, notifyUsers } from './notification-service';
import type {
  LeaderboardEntryDTO,
  LiveTournamentStateDTO,
  QuestionResultDTO,
  QuestionStatsDTO,
  TournamentSummaryDTO,
} from '@/types';

/**
 * Tournament lifecycle and the server-authoritative question clock.
 *
 * Every transition is validated against an explicit state machine, every
 * timestamp comes from the server, and the question deadline is enforced by a
 * server timer that fires whether or not anyone is connected.
 */

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export const ALLOWED_TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  DRAFT: ['REGISTRATION_OPEN', 'ARCHIVED'],
  REGISTRATION_OPEN: ['DRAFT', 'WAITING', 'LIVE', 'ARCHIVED'],
  WAITING: ['LIVE', 'REGISTRATION_OPEN', 'ARCHIVED'],
  LIVE: ['PAUSED', 'FINISHED'],
  PAUSED: ['LIVE', 'FINISHED'],
  FINISHED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function canTransition(from: TournamentStatus, to: TournamentStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: TournamentStatus, to: TournamentStatus): void {
  if (!canTransition(from, to)) {
    throw ApiError.invalidState(`A ${from} tournament cannot move to ${to}.`);
  }
}

/** Statuses in which a participant is allowed to send an answer. */
export const SUBMITTABLE_STATUSES: TournamentStatus[] = ['LIVE'];

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

export const tournamentInputSchema = z.object({
  name: z.string().trim().min(3, 'Name must be at least 3 characters').max(120),
  description: z.string().max(4000).nullish(),
  coverImageUrl: z.string().max(1000).nullish(),
  rules: z.string().max(8000).nullish(),
  startAt: z.string().datetime().nullish(),
  endAt: z.string().datetime().nullish(),
  maxParticipants: z.number().int().min(1).max(100_000).default(200),
  joinByCodeEnabled: z.boolean().default(true),
  requireApproval: z.boolean().default(false),
  allowLateJoin: z.boolean().default(true),
  showLeaderboardAfterQuestion: z.boolean().default(true),
  showAnswersToParticipants: z.boolean().default(true),
  defaultTimeLimitSeconds: z.number().int().min(5).max(600).default(30),
  defaultBasePoints: z.number().int().min(0).max(10_000).default(100),
  scoringConfig: scoringConfigSchema.default(DEFAULT_SCORING_CONFIG),
  tieBreakers: z
    .array(
      z.enum([
        'TOTAL_POINTS',
        'CORRECT_COUNT',
        'TOTAL_RESPONSE_TIME',
        'EARLIEST_LAST_SUBMISSION',
        'BEST_STREAK',
      ]),
    )
    .default(DEFAULT_TIE_BREAKERS),
});

export type TournamentInput = z.infer<typeof tournamentInputSchema>;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getTournamentOrThrow(idOrCode: string): Promise<Tournament> {
  const tournament = await prisma.tournament.findFirst({
    where: { OR: [{ id: idOrCode }, { code: normaliseCode(idOrCode) }] },
  });
  if (!tournament) throw ApiError.notFound('Tournament not found.');
  return tournament;
}

export async function toSummary(
  tournament: Tournament,
  options: { viewerId?: string | null } = {},
): Promise<TournamentSummaryDTO> {
  const [host, participantCount, questionCount, myParticipation] = await Promise.all([
    prisma.user.findUnique({
      where: { id: tournament.hostId },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
    }),
    prisma.tournamentParticipant.count({ where: { tournamentId: tournament.id } }),
    prisma.question.count({ where: { tournamentId: tournament.id } }),
    options.viewerId
      ? prisma.tournamentParticipant.findUnique({
          where: { tournamentId_userId: { tournamentId: tournament.id, userId: options.viewerId } },
          select: { id: true, status: true, rank: true, finalRank: true, totalPoints: true },
        })
      : Promise.resolve(null),
  ]);

  return {
    id: tournament.id,
    code: tournament.code,
    name: tournament.name,
    description: tournament.description,
    coverImageUrl: tournament.coverImageUrl,
    status: tournament.status,
    startAt: tournament.startAt?.toISOString() ?? null,
    endAt: tournament.endAt?.toISOString() ?? null,
    maxParticipants: tournament.maxParticipants,
    participantCount,
    questionCount,
    joinByCodeEnabled: tournament.joinByCodeEnabled,
    requireApproval: tournament.requireApproval,
    host: host ?? { id: tournament.hostId, username: 'host', displayName: 'Host', avatarUrl: null },
    createdAt: tournament.createdAt.toISOString(),
    myParticipation: myParticipation
      ? {
          participantId: myParticipation.id,
          status: myParticipation.status,
          rank: myParticipation.rank,
          finalRank: myParticipation.finalRank,
          totalPoints: myParticipation.totalPoints,
        }
      : options.viewerId
        ? null
        : undefined,
  };
}

export interface ListTournamentsOptions {
  viewerId?: string | null;
  hostId?: string;
  statuses?: TournamentStatus[];
  search?: string;
  /** Participant-facing lists hide drafts and archives. */
  publicOnly?: boolean;
  limit?: number;
  offset?: number;
}

export async function listTournaments(options: ListTournamentsOptions = {}) {
  const where: Prisma.TournamentWhereInput = {};

  if (options.hostId) where.hostId = options.hostId;
  if (options.statuses?.length) where.status = { in: options.statuses };
  else if (options.publicOnly) {
    where.status = { in: ['REGISTRATION_OPEN', 'WAITING', 'LIVE', 'PAUSED', 'FINISHED'] };
  }
  if (options.search) {
    where.OR = [
      { name: { contains: options.search, mode: 'insensitive' } },
      { code: { contains: normaliseCode(options.search), mode: 'insensitive' } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.tournament.findMany({
      where,
      orderBy: [{ status: 'asc' }, { startAt: 'asc' }, { createdAt: 'desc' }],
      take: Math.min(options.limit ?? 50, 100),
      skip: options.offset ?? 0,
    }),
    prisma.tournament.count({ where }),
  ]);

  const summaries = await Promise.all(rows.map((row) => toSummary(row, { viewerId: options.viewerId })));
  return { tournaments: summaries, total };
}

// ---------------------------------------------------------------------------
// Create / update / delete
// ---------------------------------------------------------------------------

async function generateUniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = generateTournamentCode();
    const existing = await prisma.tournament.findUnique({ where: { code }, select: { id: true } });
    if (!existing) return code;
  }
  throw new Error('Could not allocate a unique tournament code.');
}

export async function createTournament(hostId: string, input: TournamentInput): Promise<Tournament> {
  const code = await generateUniqueCode();

  const tournament = await prisma.tournament.create({
    data: {
      code,
      hostId,
      name: input.name,
      description: input.description ?? null,
      coverImageUrl: input.coverImageUrl ?? null,
      rules: input.rules ?? null,
      startAt: input.startAt ? new Date(input.startAt) : null,
      endAt: input.endAt ? new Date(input.endAt) : null,
      maxParticipants: input.maxParticipants,
      joinByCodeEnabled: input.joinByCodeEnabled,
      requireApproval: input.requireApproval,
      allowLateJoin: input.allowLateJoin,
      showLeaderboardAfterQuestion: input.showLeaderboardAfterQuestion,
      showAnswersToParticipants: input.showAnswersToParticipants,
      defaultTimeLimitSeconds: input.defaultTimeLimitSeconds,
      defaultBasePoints: input.defaultBasePoints,
      scoringConfig: input.scoringConfig as unknown as Prisma.InputJsonValue,
      tieBreakers: input.tieBreakers as unknown as Prisma.InputJsonValue,
    },
  });

  await logTournamentEvent({
    tournamentId: tournament.id,
    type: TOURNAMENT_EVENT.CREATED,
    actorId: hostId,
    payload: { name: tournament.name, code: tournament.code },
  });

  return tournament;
}

export async function updateTournament(
  tournamentId: string,
  input: TournamentInput,
  actorId: string,
): Promise<Tournament> {
  const existing = await getTournamentOrThrow(tournamentId);

  if (['LIVE', 'PAUSED'].includes(existing.status)) {
    throw ApiError.invalidState('Settings cannot be changed while a tournament is running.');
  }
  if (existing.status === 'ARCHIVED') {
    throw ApiError.invalidState('Archived tournaments are read-only.');
  }

  const tournament = await prisma.tournament.update({
    where: { id: tournamentId },
    data: {
      name: input.name,
      description: input.description ?? null,
      coverImageUrl: input.coverImageUrl ?? null,
      rules: input.rules ?? null,
      startAt: input.startAt ? new Date(input.startAt) : null,
      endAt: input.endAt ? new Date(input.endAt) : null,
      maxParticipants: input.maxParticipants,
      joinByCodeEnabled: input.joinByCodeEnabled,
      requireApproval: input.requireApproval,
      allowLateJoin: input.allowLateJoin,
      showLeaderboardAfterQuestion: input.showLeaderboardAfterQuestion,
      showAnswersToParticipants: input.showAnswersToParticipants,
      defaultTimeLimitSeconds: input.defaultTimeLimitSeconds,
      defaultBasePoints: input.defaultBasePoints,
      scoringConfig: input.scoringConfig as unknown as Prisma.InputJsonValue,
      tieBreakers: input.tieBreakers as unknown as Prisma.InputJsonValue,
    },
  });

  await logTournamentEvent({
    tournamentId,
    type: TOURNAMENT_EVENT.UPDATED,
    actorId,
    payload: { name: tournament.name },
  });

  return tournament;
}

export async function deleteTournament(tournamentId: string): Promise<void> {
  const tournament = await getTournamentOrThrow(tournamentId);
  if (['LIVE', 'PAUSED'].includes(tournament.status)) {
    throw ApiError.invalidState('Stop the tournament before deleting it.');
  }
  cancelQuestionTimer(tournamentId);
  await prisma.tournament.delete({ where: { id: tournamentId } });
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

export async function publishTournament(tournamentId: string, actorId: string): Promise<Tournament> {
  const tournament = await getTournamentOrThrow(tournamentId);
  assertTransition(tournament.status, 'REGISTRATION_OPEN');

  const questionCount = await prisma.question.count({ where: { tournamentId } });
  if (questionCount === 0) {
    throw ApiError.invalidState('Add at least one question before publishing.');
  }

  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: 'REGISTRATION_OPEN' },
  });

  await logTournamentEvent({
    tournamentId,
    type: TOURNAMENT_EVENT.PUBLISHED,
    actorId,
    payload: { questionCount },
  });

  return updated;
}

export async function unpublishTournament(tournamentId: string, actorId: string): Promise<Tournament> {
  const tournament = await getTournamentOrThrow(tournamentId);
  assertTransition(tournament.status, 'DRAFT');

  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: 'DRAFT' },
  });

  await logTournamentEvent({ tournamentId, type: TOURNAMENT_EVENT.UNPUBLISHED, actorId });
  return updated;
}

export async function openWaitingRoom(tournamentId: string, actorId: string): Promise<Tournament> {
  const tournament = await getTournamentOrThrow(tournamentId);
  assertTransition(tournament.status, 'WAITING');

  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: 'WAITING' },
  });

  await logTournamentEvent({ tournamentId, type: TOURNAMENT_EVENT.WAITING_ROOM_OPENED, actorId });
  await broadcastState(tournamentId);

  const participants = await prisma.tournamentParticipant.findMany({
    where: { tournamentId, status: 'ACTIVE' },
    select: { userId: true },
  });
  await notifyUsers(
    participants.map((p) => p.userId),
    {
      type: NOTIFICATION_TYPE.TOURNAMENT_STARTING,
      title: `${tournament.name} is about to start`,
      body: 'Head to the waiting room - the host is getting ready.',
      data: { tournamentId },
    },
  );

  return updated;
}

// ---------------------------------------------------------------------------
// Live control
// ---------------------------------------------------------------------------

async function loadOrderedQuestions(tournamentId: string): Promise<QuestionWithOptions[]> {
  return listQuestions(tournamentId);
}

/**
 * Opens a question: stamps the authoritative start/end times, schedules the
 * server-side close and pushes the sanitised question to every client at once.
 */
async function openQuestion(
  tournamentId: string,
  question: QuestionWithOptions,
  context: { index: number; totalQuestions: number },
): Promise<void> {
  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + question.timeLimitSeconds * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.question.update({
      where: { id: question.id },
      data: { status: 'ACTIVE', startedAt, endsAt, closedAt: null },
    });
    await tx.tournament.update({
      where: { id: tournamentId },
      data: {
        currentQuestionId: question.id,
        questionStartedAt: startedAt,
        questionEndsAt: endsAt,
        pausedElapsedMs: 0,
      },
    });
    await logTournamentEvent(
      {
        tournamentId,
        type: TOURNAMENT_EVENT.QUESTION_STARTED,
        payload: { questionId: question.id, order: question.order, endsAt: endsAt.toISOString() },
      },
      tx,
    );
  });

  scheduleQuestionClose(tournamentId, question.id, endsAt);

  const dto = toParticipantQuestion({ ...question, status: 'ACTIVE', startedAt, endsAt }, context);

  emitToTournament(tournamentId, 'question:started', {
    tournamentId,
    question: dto,
    serverNow: new Date().toISOString(),
  });

  await emitQuestionStats(tournamentId, question.id, context.index);
}

export async function startTournament(tournamentId: string, actorId: string): Promise<Tournament> {
  const tournament = await getTournamentOrThrow(tournamentId);
  assertTransition(tournament.status, 'LIVE');

  const questions = await loadOrderedQuestions(tournamentId);
  if (!questions.length) throw ApiError.invalidState('This tournament has no questions.');

  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: 'LIVE', startedAt: new Date(), pausedAt: null, pausedElapsedMs: 0 },
  });

  await logTournamentEvent({
    tournamentId,
    type: TOURNAMENT_EVENT.STARTED,
    actorId,
    payload: { questionCount: questions.length },
  });

  emitToTournament(tournamentId, 'tournament:started', {
    tournamentId,
    startedAt: updated.startedAt!.toISOString(),
    questionCount: questions.length,
  });

  const participants = await prisma.tournamentParticipant.findMany({
    where: { tournamentId, status: 'ACTIVE' },
    select: { userId: true },
  });
  await notifyUsers(
    participants.map((p) => p.userId),
    {
      type: NOTIFICATION_TYPE.TOURNAMENT_STARTED,
      title: `${tournament.name} has started`,
      body: 'Question 1 is live. Good luck!',
      data: { tournamentId },
    },
  );

  await openQuestion(tournamentId, questions[0], { index: 1, totalQuestions: questions.length });

  return updated;
}

export interface CloseQuestionOptions {
  questionId?: string;
  reason: 'TIME_EXPIRED' | 'HOST_CLOSED' | 'HOST_ADVANCED' | 'HOST_ENDED';
  actorId?: string;
}

/**
 * Closes the open question exactly once.
 *
 * The timer and the host's "next question" button can fire at the same instant,
 * so the tournament row is locked and the question status re-checked inside the
 * transaction: the loser of the race becomes a no-op.
 */
export async function closeActiveQuestion(
  tournamentId: string,
  options: CloseQuestionOptions,
): Promise<{ closed: boolean; questionId: string | null }> {
  cancelQuestionTimer(tournamentId);

  const outcome = await prisma.$transaction(async (tx) => {
    await lockTournamentRow(tx, tournamentId);

    const tournament = await tx.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) throw ApiError.notFound('Tournament not found.');

    const questionId = options.questionId ?? tournament.currentQuestionId;
    if (!questionId) return { closed: false, questionId: null };

    const question = await tx.question.findUnique({ where: { id: questionId } });
    if (!question || question.status !== 'ACTIVE') {
      return { closed: false, questionId };
    }

    const closedAt = new Date();

    await tx.question.update({
      where: { id: questionId },
      data: { status: 'CLOSED', closedAt },
    });

    await tx.tournament.update({
      where: { id: tournamentId },
      data: { currentQuestionId: null, questionStartedAt: null, questionEndsAt: null, pausedElapsedMs: 0 },
    });

    const config = parseScoringConfig(tournament.scoringConfig);
    const timeLimitMs = question.timeLimitSeconds * 1000;

    // One statement records "no answer" for every active player who never
    // submitted, so the results set is always complete.
    await tx.$executeRaw`
      INSERT INTO "Submission" (
        "id", "tournamentId", "questionId", "userId", "participantId",
        "responseTimeMs", "outcome", "status", "awardedPoints", "basePoints",
        "speedBonus", "isCorrect", "submittedAt", "createdAt", "updatedAt"
      )
      SELECT
        gen_random_uuid()::text, ${tournamentId}, ${questionId}, p."userId", p."id",
        ${timeLimitMs}, 'NO_ANSWER'::"SubmissionOutcome", 'AUTO_GRADED'::"SubmissionStatus",
        ${config.noAnswerPoints}, 0, 0, false, ${closedAt}, ${closedAt}, ${closedAt}
      FROM "TournamentParticipant" p
      WHERE p."tournamentId" = ${tournamentId}
        AND p."status" = 'ACTIVE'
        AND NOT EXISTS (
          SELECT 1 FROM "Submission" s
          WHERE s."questionId" = ${questionId} AND s."userId" = p."userId"
        )
    `;

    // Missing an answer breaks the streak and applies the configured penalty.
    await tx.$executeRaw`
      UPDATE "TournamentParticipant" p
      SET "currentStreak" = 0,
          "totalPoints" = GREATEST(0, p."totalPoints" + ${config.noAnswerPoints})
      FROM "Submission" s
      WHERE s."questionId" = ${questionId}
        AND s."participantId" = p."id"
        AND s."outcome" = 'NO_ANSWER'
        AND s."submittedAt" = ${closedAt}
    `;

    await logTournamentEvent(
      {
        tournamentId,
        type: TOURNAMENT_EVENT.QUESTION_CLOSED,
        actorId: options.actorId ?? null,
        payload: { questionId, reason: options.reason },
      },
      tx,
    );

    return { closed: true, questionId };
  });

  if (!outcome.closed || !outcome.questionId) return outcome;

  await invalidateLeaderboard(tournamentId);
  await publishQuestionResults(tournamentId, outcome.questionId);

  return outcome;
}

/** Builds and fans out everything that happens the moment a question closes. */
async function publishQuestionResults(tournamentId: string, questionId: string): Promise<void> {
  const [tournament, questions] = await Promise.all([
    prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } }),
    loadOrderedQuestions(tournamentId),
  ]);

  const question = questions.find((q) => q.id === questionId);
  if (!question) return;

  const index = questions.findIndex((q) => q.id === questionId) + 1;
  const isLastQuestion = index >= questions.length;

  const standings = await refreshRanks(tournamentId, {
    questionId,
    questionOrder: question.order,
    isFinal: false,
  });
  const standingByUser = new Map(standings.map((entry) => [entry.userId, entry] as const));

  const submissions = await prisma.submission.findMany({
    where: { questionId },
    select: {
      id: true,
      userId: true,
      outcome: true,
      awardedPoints: true,
      basePoints: true,
      speedBonus: true,
      responseTimeMs: true,
      submittedAt: true,
      answer: true,
      status: true,
    },
  });

  // Badges are decided here, not at submit time: awarding "first blood" while
  // the question is still open would tell a player they answered correctly.
  await evaluateQuestionBadges({
    tournamentId,
    questionId,
    timeLimitMs: question.timeLimitSeconds * 1000,
    submissions: submissions.map((s) => ({
      id: s.id,
      userId: s.userId,
      outcome: s.outcome,
      responseTimeMs: s.responseTimeMs,
      submittedAt: s.submittedAt,
    })),
    streakByUser: new Map(standings.map((s) => [s.userId, s.currentStreak] as const)),
  });

  await evaluateComebackBadges(
    tournamentId,
    standings.map((entry) => ({
      userId: entry.userId,
      rank: entry.rank,
      previousRank: entry.previousRank,
    })),
  );

  const reveal = buildReveal(question);
  const stats = await buildQuestionStats(tournamentId, question, index);

  // Host always sees the full picture.
  emitToHost(tournamentId, 'question:ended', {
    tournamentId,
    questionId,
    questionIndex: index,
    reveal,
    stats,
    leaderboard: { tournamentId, entries: standings.slice(0, 50), total: standings.length, updatedAt: new Date().toISOString(), questionOrder: question.order },
    isLastQuestion,
  });

  // Players see the answer only when the host allows it, and the leaderboard
  // only when per-question standings are enabled.
  emitToTournament(tournamentId, 'question:ended', {
    tournamentId,
    questionId,
    questionIndex: index,
    reveal: tournament.showAnswersToParticipants
      ? reveal
      : { questionId, correctOptionIds: [], correctAnswerText: null, explanation: null },
    stats: { ...stats, optionBreakdown: tournament.showAnswersToParticipants ? stats.optionBreakdown : [] },
    leaderboard: {
      tournamentId,
      entries: tournament.showLeaderboardAfterQuestion ? standings.slice(0, 25) : [],
      total: standings.length,
      updatedAt: new Date().toISOString(),
      questionOrder: question.order,
    },
    isLastQuestion,
  });

  if (tournament.showLeaderboardAfterQuestion) {
    emitToTournament(tournamentId, 'leaderboard:updated', {
      tournamentId,
      entries: standings.slice(0, 25),
      total: standings.length,
      updatedAt: new Date().toISOString(),
      questionOrder: question.order,
    });
  }

  const badgesByUser = await loadRecentBadges(
    tournamentId,
    submissions.map((s) => s.userId),
  );

  for (const submission of submissions) {
    const standing = standingByUser.get(submission.userId);
    const answer = submission.answer as { type?: string } | null;

    const payload: QuestionResultDTO = {
      questionId,
      questionIndex: index,
      outcome: submission.outcome,
      awardedPoints: submission.awardedPoints,
      basePoints: submission.basePoints,
      speedBonus: submission.speedBonus,
      responseTimeMs: submission.outcome === 'NO_ANSWER' ? null : submission.responseTimeMs,
      answerSummary: summariseAnswer(answer, question),
      reveal: tournament.showAnswersToParticipants ? reveal : null,
      rank: standing?.rank ?? null,
      previousRank: standing?.previousRank ?? null,
      rankDelta: standing?.rankDelta ?? null,
      totalPoints: standing?.totalPoints ?? 0,
      currentStreak: standing?.currentStreak ?? 0,
      badges: badgesByUser.get(submission.userId) ?? [],
      awaitingReview: submission.status === 'PENDING_REVIEW',
    };

    emitToUser(submission.userId, 'question:result', payload);
  }
}

function summariseAnswer(answer: { type?: string } | null, question: QuestionWithOptions): string | null {
  if (!answer) return null;
  const raw = answer as Record<string, unknown>;
  if (raw.optionId) {
    return question.options.find((o) => o.id === raw.optionId)?.text ?? null;
  }
  if (typeof raw.text === 'string') return raw.text;
  if (typeof raw.value === 'number') return String(raw.value);
  if (raw.fileId) return 'Uploaded solution';
  return null;
}

async function loadRecentBadges(tournamentId: string, userIds: string[]) {
  if (!userIds.length) return new Map<string, QuestionResultDTO['badges']>();

  const since = new Date(Date.now() - 60_000);
  const rows = await prisma.userBadge.findMany({
    where: { tournamentId, userId: { in: userIds }, awardedAt: { gte: since } },
    include: { badge: true },
  });

  const map = new Map<string, QuestionResultDTO['badges']>();
  for (const row of rows) {
    const list = map.get(row.userId) ?? [];
    list.push({
      code: row.badge.code,
      name: row.badge.name,
      description: row.badge.description,
      icon: row.badge.icon,
      color: row.badge.color,
    });
    map.set(row.userId, list);
  }
  return map;
}

export async function buildQuestionStats(
  tournamentId: string,
  question: QuestionWithOptions,
  index: number,
): Promise<QuestionStatsDTO> {
  const [grouped, eligible, answered] = await Promise.all([
    prisma.submission.groupBy({
      by: ['outcome'],
      where: { questionId: question.id },
      _count: { _all: true },
      _avg: { responseTimeMs: true },
    }),
    prisma.tournamentParticipant.count({ where: { tournamentId, status: 'ACTIVE' } }),
    prisma.submission.findMany({
      where: { questionId: question.id, outcome: { not: 'NO_ANSWER' } },
      select: { answer: true, responseTimeMs: true, status: true },
    }),
  ]);

  const countFor = (outcome: string) =>
    grouped.find((g) => g.outcome === outcome)?._count._all ?? 0;

  const submitted = answered.length;
  const averageResponseMs = submitted
    ? Math.round(answered.reduce((sum, row) => sum + row.responseTimeMs, 0) / submitted)
    : null;

  const optionCounts = new Map<string, number>();
  for (const row of answered) {
    const optionId = (row.answer as { optionId?: string } | null)?.optionId;
    if (optionId) optionCounts.set(optionId, (optionCounts.get(optionId) ?? 0) + 1);
  }

  return {
    questionId: question.id,
    index,
    submitted,
    connected: connectedParticipantCount(tournamentId),
    eligible,
    waiting: Math.max(0, eligible - submitted),
    correct: countFor('CORRECT') + countFor('PARTIAL'),
    incorrect: countFor('INCORRECT'),
    pendingReview: answered.filter((row) => row.status === 'PENDING_REVIEW').length,
    averageResponseMs,
    optionBreakdown: question.options.map((option) => ({
      optionId: option.id,
      label: option.text,
      count: optionCounts.get(option.id) ?? 0,
      isCorrect: option.isCorrect,
    })),
  };
}

/** Pushes live counters to the host console (never to players mid-question). */
export async function emitQuestionStats(
  tournamentId: string,
  questionId: string,
  index?: number,
): Promise<void> {
  const questions = await loadOrderedQuestions(tournamentId);
  const question = questions.find((q) => q.id === questionId);
  if (!question) return;

  const resolvedIndex = index ?? questions.findIndex((q) => q.id === questionId) + 1;
  const stats = await buildQuestionStats(tournamentId, question, resolvedIndex);
  emitToHost(tournamentId, 'question:stats', stats);
}

export async function advanceToNextQuestion(
  tournamentId: string,
  actorId: string,
): Promise<{ finished: boolean; questionIndex: number | null }> {
  const tournament = await getTournamentOrThrow(tournamentId);
  if (!['LIVE', 'PAUSED'].includes(tournament.status)) {
    throw ApiError.invalidState('The tournament is not running.');
  }

  await closeActiveQuestion(tournamentId, { reason: 'HOST_ADVANCED', actorId });

  const questions = await loadOrderedQuestions(tournamentId);
  const next = questions.find((q) => q.status === 'UPCOMING');

  if (!next) {
    await endTournament(tournamentId, actorId);
    return { finished: true, questionIndex: null };
  }

  if (tournament.status === 'PAUSED') {
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'LIVE', pausedAt: null },
    });
  }

  const index = questions.findIndex((q) => q.id === next.id) + 1;
  await openQuestion(tournamentId, next, { index, totalQuestions: questions.length });

  return { finished: false, questionIndex: index };
}

export async function pauseTournament(tournamentId: string, actorId: string): Promise<Tournament> {
  const tournament = await getTournamentOrThrow(tournamentId);
  assertTransition(tournament.status, 'PAUSED');

  cancelQuestionTimer(tournamentId);
  const pausedAt = new Date();

  // Remember how much of the question window was already consumed so the clock
  // resumes exactly where it stopped.
  const elapsedMs = tournament.questionStartedAt
    ? Math.max(0, pausedAt.getTime() - tournament.questionStartedAt.getTime())
    : 0;

  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: 'PAUSED', pausedAt, pausedElapsedMs: elapsedMs },
  });

  await logTournamentEvent({ tournamentId, type: TOURNAMENT_EVENT.PAUSED, actorId });
  emitToTournament(tournamentId, 'tournament:paused', {
    tournamentId,
    pausedAt: pausedAt.toISOString(),
  });

  return updated;
}

export async function resumeTournament(tournamentId: string, actorId: string): Promise<Tournament> {
  const tournament = await getTournamentOrThrow(tournamentId);
  assertTransition(tournament.status, 'LIVE');

  const now = new Date();
  let endsAt: Date | null = null;
  let startedAt: Date | null = null;

  if (tournament.currentQuestionId) {
    const question = await prisma.question.findUnique({ where: { id: tournament.currentQuestionId } });
    if (question && question.status === 'ACTIVE') {
      const timeLimitMs = question.timeLimitSeconds * 1000;
      const remainingMs = Math.max(1000, timeLimitMs - tournament.pausedElapsedMs);
      // Shifting the start time forward keeps response-time maths honest: a
      // player is never charged for the seconds the tournament was paused.
      startedAt = new Date(now.getTime() - tournament.pausedElapsedMs);
      endsAt = new Date(now.getTime() + remainingMs);

      await prisma.question.update({
        where: { id: question.id },
        data: { startedAt, endsAt },
      });
      scheduleQuestionClose(tournamentId, question.id, endsAt);
    }
  }

  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data: {
      status: 'LIVE',
      pausedAt: null,
      pausedElapsedMs: 0,
      ...(startedAt ? { questionStartedAt: startedAt } : {}),
      ...(endsAt ? { questionEndsAt: endsAt } : {}),
    },
  });

  await logTournamentEvent({ tournamentId, type: TOURNAMENT_EVENT.RESUMED, actorId });
  emitToTournament(tournamentId, 'tournament:resumed', {
    tournamentId,
    endsAt: endsAt ? endsAt.toISOString() : null,
    serverNow: new Date().toISOString(),
  });

  return updated;
}

export async function endTournament(tournamentId: string, actorId: string): Promise<Tournament> {
  const tournament = await getTournamentOrThrow(tournamentId);
  if (!['LIVE', 'PAUSED'].includes(tournament.status)) {
    throw ApiError.invalidState('Only a running tournament can be ended.');
  }

  await closeActiveQuestion(tournamentId, { reason: 'HOST_ENDED', actorId });

  const finishedAt = new Date();
  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data: {
      status: 'FINISHED',
      finishedAt,
      currentQuestionId: null,
      questionStartedAt: null,
      questionEndsAt: null,
    },
  });

  const questionCount = await prisma.question.count({ where: { tournamentId } });
  const standings = await refreshRanks(tournamentId, { isFinal: true });

  await applyLifetimeStats(tournamentId, standings);
  await evaluateTournamentEndBadges(
    tournamentId,
    standings.map((s) => ({ userId: s.userId, rank: s.rank, correctCount: s.correctCount })),
    questionCount,
  );

  await logTournamentEvent({
    tournamentId,
    type: TOURNAMENT_EVENT.ENDED,
    actorId,
    payload: { participants: standings.length },
  });

  const leaderboard = await getLeaderboard(tournamentId, { limit: 100 });
  emitToTournament(tournamentId, 'tournament:ended', {
    tournamentId,
    finishedAt: finishedAt.toISOString(),
    leaderboard,
  });

  await notifyUsers(
    standings.map((s) => s.userId),
    {
      type: NOTIFICATION_TYPE.TOURNAMENT_FINISHED,
      title: `${tournament.name} is complete`,
      body: 'Final standings and your personal stats are ready.',
      data: { tournamentId },
    },
  );

  return updated;
}

/** Rolls tournament results into the lifetime numbers shown on a profile. */
async function applyLifetimeStats(
  tournamentId: string,
  standings: LeaderboardEntryDTO[],
): Promise<void> {
  if (!standings.length) return;

  const values = Prisma.join(
    standings.map(
      (entry) => Prisma.sql`(${entry.userId}::text, ${entry.totalPoints}::int, ${entry.rank === 1}::boolean)`,
    ),
  );

  await prisma.$executeRaw`
    UPDATE "User" u
    SET "totalTournaments" = u."totalTournaments" + 1,
        "totalPoints" = u."totalPoints" + v.points,
        "totalWins" = u."totalWins" + CASE WHEN v.won THEN 1 ELSE 0 END
    FROM (VALUES ${values}) AS v(id, points, won)
    WHERE u.id = v.id
  `;
}

export async function archiveTournament(tournamentId: string, actorId: string): Promise<Tournament> {
  const tournament = await getTournamentOrThrow(tournamentId);
  assertTransition(tournament.status, 'ARCHIVED');

  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: 'ARCHIVED' },
  });
  await logTournamentEvent({ tournamentId, type: TOURNAMENT_EVENT.ARCHIVED, actorId });
  return updated;
}

// ---------------------------------------------------------------------------
// Live state for clients
// ---------------------------------------------------------------------------

export async function getLiveState(
  tournamentId: string,
  viewerId: string | null,
): Promise<LiveTournamentStateDTO> {
  const tournament = await getTournamentOrThrow(tournamentId);
  const questions = await loadOrderedQuestions(tournament.id);

  const currentIndex = tournament.currentQuestionId
    ? questions.findIndex((q) => q.id === tournament.currentQuestionId) + 1
    : null;

  const current = tournament.currentQuestionId
    ? questions.find((q) => q.id === tournament.currentQuestionId) ?? null
    : null;

  const [participantCount, mySubmission] = await Promise.all([
    prisma.tournamentParticipant.count({ where: { tournamentId: tournament.id, status: 'ACTIVE' } }),
    viewerId && current
      ? prisma.submission.findUnique({
          where: { questionId_userId: { questionId: current.id, userId: viewerId } },
          select: { questionId: true, submittedAt: true, answer: true },
        })
      : Promise.resolve(null),
  ]);

  return {
    id: tournament.id,
    code: tournament.code,
    name: tournament.name,
    status: tournament.status,
    questionCount: questions.length,
    currentQuestionIndex: currentIndex,
    currentQuestion:
      current && current.status === 'ACTIVE'
        ? toParticipantQuestion(current, { index: currentIndex ?? 1, totalQuestions: questions.length })
        : null,
    serverNow: new Date().toISOString(),
    participantCount,
    connectedCount: connectedParticipantCount(tournament.id),
    showLeaderboardAfterQuestion: tournament.showLeaderboardAfterQuestion,
    showAnswersToParticipants: tournament.showAnswersToParticipants,
    mySubmission: mySubmission
      ? {
          questionId: mySubmission.questionId,
          submittedAt: mySubmission.submittedAt.toISOString(),
          answerSummary: current ? summariseAnswer(mySubmission.answer as { type?: string } | null, current) : null,
        }
      : null,
  };
}

export async function broadcastState(tournamentId: string): Promise<void> {
  const state = await getLiveState(tournamentId, null);
  emitToTournament(tournamentId, 'tournament:state', state);
}

export { parseScoringConfig };
export type { Tx };
