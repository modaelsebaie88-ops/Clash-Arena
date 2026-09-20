import { Prisma, type Submission } from '@prisma/client';
import { z } from 'zod';
import { prisma, lockParticipantRow, lockTournamentRowShared, type Tx } from '../db';
import { ApiError } from '../http';
import { clamp } from '../utils';
import { TOURNAMENT_EVENT } from '../realtime/events';
import { emitToHost, emitToUser } from '../realtime/server';
import { logTournamentEvent } from './event-log-service';
import { evaluateAnswer, getQuestionOrThrow, type QuestionWithOptions } from './question-service';
import { requireActiveParticipant } from './participant-service';
import { calculateScore, parseScoringConfig } from './scoring-service';
import { invalidateLeaderboard, refreshRanks } from './leaderboard-service';
import { NOTIFICATION_TYPE, notifyUser } from './notification-service';
import type { AnswerPayload, SubmissionOutcomeDTO } from '@/types';

/**
 * Submission rules, in order of importance:
 *
 *  1. Timing comes from the server. The client never sends a timestamp, and the
 *     response time is measured against Question.startedAt.
 *  2. A late answer is rejected outright - the deadline is re-read inside the
 *     transaction, so an answer cannot slip in while the question is closing.
 *  3. One answer per player per question, enforced by a unique index.
 *  4. The response to a submission never reveals correctness or points. Those
 *     are only published when the question closes, for everyone at once.
 */

export const answerPayloadSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('MCQ'), optionId: z.string().min(1) }),
  z.object({ type: z.literal('TRUE_FALSE'), optionId: z.string().min(1) }),
  z.object({ type: z.literal('SHORT_ANSWER'), text: z.string().trim().min(1).max(2000) }),
  z.object({ type: z.literal('NUMERIC'), value: z.number().finite() }),
  z.object({ type: z.literal('IMAGE_SUBMISSION'), fileId: z.string().min(1) }),
]);

export interface SubmitAnswerInput {
  questionId: string;
  userId: string;
  answer: AnswerPayload;
}

export interface SubmitAnswerResult {
  submissionId: string;
  submittedAt: string;
  responseTimeMs: number;
  awaitingReview: boolean;
}

export async function submitAnswer(input: SubmitAnswerInput): Promise<SubmitAnswerResult> {
  // Captured before any I/O so queue time never counts against the player.
  const receivedAt = new Date();

  const question = await getQuestionOrThrow(input.questionId);
  const tournament = await prisma.tournament.findUniqueOrThrow({
    where: { id: question.tournamentId },
  });

  if (tournament.status !== 'LIVE') {
    throw ApiError.invalidState(
      tournament.status === 'PAUSED'
        ? 'The host paused the tournament.'
        : 'This tournament is not currently live.',
    );
  }

  const participant = await requireActiveParticipant(tournament.id, input.userId);

  if (question.type === 'IMAGE_SUBMISSION') {
    await assertOwnedUpload(input.answer, input.userId);
  }

  const config = parseScoringConfig(tournament.scoringConfig);
  const timeLimitMs = question.timeLimitSeconds * 1000;

  try {
    const created = await prisma.$transaction(async (tx) => {
      // Shared lock: submissions run concurrently with each other but never
      // interleave with the exclusive lock taken when a question closes.
      await lockTournamentRowShared(tx, tournament.id);

      const live = await tx.question.findUniqueOrThrow({
        where: { id: question.id },
        select: { status: true, startedAt: true, endsAt: true },
      });

      if (live.status !== 'ACTIVE' || !live.startedAt || !live.endsAt) {
        throw ApiError.invalidState('This question is no longer accepting answers.');
      }

      if (receivedAt.getTime() > live.endsAt.getTime()) {
        throw ApiError.invalidState('Time expired before your answer reached the server.');
      }

      const responseTimeMs = clamp(
        receivedAt.getTime() - live.startedAt.getTime(),
        0,
        timeLimitMs,
      );

      const evaluation = evaluateAnswer(question, input.answer);

      await lockParticipantRow(tx, participant.id);
      const current = await tx.tournamentParticipant.findUniqueOrThrow({
        where: { id: participant.id },
        select: { currentStreak: true, bestStreak: true, fastestResponseMs: true },
      });

      const breakdown = calculateScore({
        outcome: evaluation.outcome,
        responseTimeMs,
        timeLimitMs,
        basePoints: question.basePoints,
        speedBonusPoints: question.speedBonusPoints,
        streakBefore: current.currentStreak,
        config,
      });

      const awaitingReview = evaluation.requiresManualGrading;
      const awardedPoints = awaitingReview ? 0 : breakdown.total;

      const submission = await tx.submission.create({
        data: {
          tournamentId: tournament.id,
          questionId: question.id,
          userId: input.userId,
          participantId: participant.id,
          answer: input.answer as unknown as Prisma.InputJsonValue,
          uploadedFileId:
            input.answer.type === 'IMAGE_SUBMISSION' ? input.answer.fileId : null,
          uploadedImageUrl:
            input.answer.type === 'IMAGE_SUBMISSION' ? `/api/files/${input.answer.fileId}` : null,
          submittedAt: receivedAt,
          responseTimeMs,
          outcome: awaitingReview ? 'PENDING' : evaluation.outcome,
          isCorrect: awaitingReview ? null : evaluation.outcome === 'CORRECT',
          awardedPoints,
          basePoints: awaitingReview ? 0 : breakdown.basePoints,
          speedBonus: awaitingReview ? 0 : breakdown.speedBonus,
          status: awaitingReview ? 'PENDING_REVIEW' : 'AUTO_GRADED',
        },
      });

      const isCorrect = !awaitingReview && evaluation.outcome === 'CORRECT';
      const isWrong = !awaitingReview && evaluation.outcome === 'INCORRECT';
      const nextStreak = isCorrect ? current.currentStreak + 1 : 0;

      await tx.tournamentParticipant.update({
        where: { id: participant.id },
        data: {
          totalPoints: { increment: awardedPoints },
          answeredCount: { increment: 1 },
          correctCount: { increment: isCorrect ? 1 : 0 },
          wrongCount: { increment: isWrong ? 1 : 0 },
          totalResponseTimeMs: { increment: responseTimeMs },
          currentStreak: nextStreak,
          bestStreak: Math.max(current.bestStreak, nextStreak),
          fastestResponseMs:
            current.fastestResponseMs === null
              ? responseTimeMs
              : Math.min(current.fastestResponseMs, responseTimeMs),
          lastSubmissionAt: receivedAt,
        },
      });

      if (awardedPoints !== 0) {
        await tx.score.create({
          data: {
            tournamentId: tournament.id,
            userId: input.userId,
            participantId: participant.id,
            questionId: question.id,
            submissionId: submission.id,
            points: awardedPoints,
            reason: 'ANSWER',
          },
        });
      }

      return { submission, responseTimeMs, awaitingReview };
    });

    await invalidateLeaderboard(tournament.id);

    // Acknowledge privately, and update the host console counters. Nothing here
    // tells the player whether they were right.
    emitToUser(input.userId, 'question:submissionAck', {
      questionId: question.id,
      submittedAt: created.submission.submittedAt.toISOString(),
    });

    void emitHostSubmissionProgress(tournament.id, question);

    return {
      submissionId: created.submission.id,
      submittedAt: created.submission.submittedAt.toISOString(),
      responseTimeMs: created.responseTimeMs,
      awaitingReview: created.awaitingReview,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw ApiError.conflict('You have already answered this question.');
    }
    throw error;
  }
}

async function assertOwnedUpload(answer: AnswerPayload, userId: string): Promise<void> {
  if (answer.type !== 'IMAGE_SUBMISSION') {
    throw ApiError.badRequest('This question needs a photo of your solution.');
  }
  const file = await prisma.uploadedFile.findUnique({ where: { id: answer.fileId } });
  if (!file) throw ApiError.badRequest('That upload could not be found.');
  if (file.ownerId !== userId) throw ApiError.forbidden('That upload belongs to someone else.');
}

async function emitHostSubmissionProgress(
  tournamentId: string,
  question: QuestionWithOptions,
): Promise<void> {
  try {
    const { buildQuestionStats } = await import('./tournament-service');
    const questions = await prisma.question.findMany({
      where: { tournamentId },
      orderBy: { order: 'asc' },
      select: { id: true },
    });
    const index = questions.findIndex((q) => q.id === question.id) + 1;
    const stats = await buildQuestionStats(tournamentId, question, index);
    emitToHost(tournamentId, 'question:stats', stats);
    emitToHost(tournamentId, 'question:submitted', {
      tournamentId,
      questionId: question.id,
      submitted: stats.submitted,
      eligible: stats.eligible,
    });
  } catch (error) {
    console.error('[submissions] failed to push host stats:', error);
  }
}

// ---------------------------------------------------------------------------
// Manual grading (image questions today, AI-assisted later)
// ---------------------------------------------------------------------------

export const gradeInputSchema = z.object({
  outcome: z.enum(['CORRECT', 'PARTIAL', 'INCORRECT']),
  /** Optional explicit award. When omitted the scoring service decides. */
  points: z.number().int().min(0).max(10_000).optional(),
  feedback: z.string().max(2000).nullish(),
});

export type GradeInput = z.infer<typeof gradeInputSchema>;

export async function gradeSubmission(
  submissionId: string,
  graderId: string,
  input: GradeInput,
): Promise<Submission> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { question: true, tournament: true },
  });
  if (!submission) throw ApiError.notFound('Submission not found.');

  const config = parseScoringConfig(submission.tournament.scoringConfig);
  const timeLimitMs = submission.question.timeLimitSeconds * 1000;

  const graded = await prisma.$transaction(async (tx) => {
    await lockParticipantRow(tx, submission.participantId);

    const streakBefore = await streakBeforeQuestion(tx, submission.participantId, submission.question.order);

    const breakdown = calculateScore({
      outcome: input.outcome,
      responseTimeMs: submission.responseTimeMs,
      timeLimitMs,
      basePoints: submission.question.basePoints,
      speedBonusPoints: submission.question.speedBonusPoints,
      streakBefore,
      partialRatio: 0.5,
      config,
    });

    const awardedPoints = input.points ?? breakdown.total;

    const updated = await tx.submission.update({
      where: { id: submissionId },
      data: {
        outcome: input.outcome,
        isCorrect: input.outcome === 'CORRECT',
        awardedPoints,
        basePoints: input.points === undefined ? breakdown.basePoints : awardedPoints,
        speedBonus: input.points === undefined ? breakdown.speedBonus : 0,
        status: 'MANUALLY_GRADED',
        gradedById: graderId,
        gradedAt: new Date(),
        feedback: input.feedback ?? null,
      },
    });

    await tx.score.upsert({
      where: { id: `grade-${submissionId}` },
      create: {
        id: `grade-${submissionId}`,
        tournamentId: submission.tournamentId,
        userId: submission.userId,
        participantId: submission.participantId,
        questionId: submission.questionId,
        submissionId,
        points: awardedPoints,
        reason: 'MANUAL_GRADE',
        note: input.feedback ?? null,
      },
      update: { points: awardedPoints, note: input.feedback ?? null },
    });

    await recomputeParticipantAggregates(tx, submission.participantId);

    await logTournamentEvent(
      {
        tournamentId: submission.tournamentId,
        type: TOURNAMENT_EVENT.SUBMISSION_GRADED,
        actorId: graderId,
        payload: { submissionId, outcome: input.outcome, awardedPoints },
      },
      tx,
    );

    return updated;
  });

  await invalidateLeaderboard(submission.tournamentId);
  await refreshRanks(submission.tournamentId, { questionId: submission.questionId });

  await notifyUser(submission.userId, {
    type: NOTIFICATION_TYPE.SUBMISSION_GRADED,
    title: `Your solution was reviewed: ${input.outcome.toLowerCase()}`,
    body: input.feedback ?? `You were awarded ${graded.awardedPoints} points.`,
    data: { tournamentId: submission.tournamentId, questionId: submission.questionId },
  });

  const leaderboard = await import('./leaderboard-service').then((m) =>
    m.getLeaderboard(submission.tournamentId, { limit: 25 }),
  );
  emitToHost(submission.tournamentId, 'leaderboard:updated', leaderboard);

  return graded;
}

/** Number of consecutive correct answers immediately before a given question. */
async function streakBeforeQuestion(tx: Tx, participantId: string, questionOrder: number) {
  const previous = await tx.submission.findMany({
    where: { participantId, question: { order: { lt: questionOrder } } },
    include: { question: { select: { order: true } } },
    orderBy: { question: { order: 'asc' } },
  });

  let streak = 0;
  for (const row of previous) {
    if (row.outcome === 'CORRECT') streak += 1;
    else streak = 0;
  }
  return streak;
}

/**
 * Rebuilds a participant's aggregates from their submissions plus any manual
 * adjustments. Used after grading or a score override, where incremental
 * updates would be ambiguous.
 */
export async function recomputeParticipantAggregates(tx: Tx, participantId: string): Promise<void> {
  const submissions = await tx.submission.findMany({
    where: { participantId },
    include: { question: { select: { order: true } } },
    orderBy: { question: { order: 'asc' } },
  });

  const adjustments = await tx.score.aggregate({
    where: { participantId, reason: 'ADMIN_ADJUSTMENT' },
    _sum: { points: true },
  });

  let totalPoints = adjustments._sum.points ?? 0;
  let answeredCount = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let totalResponseTimeMs = 0;
  let currentStreak = 0;
  let bestStreak = 0;
  let fastestResponseMs: number | null = null;
  let lastSubmissionAt: Date | null = null;

  for (const row of submissions) {
    totalPoints += row.awardedPoints;

    if (row.outcome !== 'NO_ANSWER') {
      answeredCount += 1;
      totalResponseTimeMs += row.responseTimeMs;
      fastestResponseMs =
        fastestResponseMs === null ? row.responseTimeMs : Math.min(fastestResponseMs, row.responseTimeMs);
      if (!lastSubmissionAt || row.submittedAt > lastSubmissionAt) lastSubmissionAt = row.submittedAt;
    }

    if (row.outcome === 'CORRECT') {
      correctCount += 1;
      currentStreak += 1;
      bestStreak = Math.max(bestStreak, currentStreak);
    } else if (row.outcome === 'INCORRECT') {
      wrongCount += 1;
      currentStreak = 0;
    } else if (row.outcome === 'NO_ANSWER') {
      currentStreak = 0;
    }
  }

  await tx.tournamentParticipant.update({
    where: { id: participantId },
    data: {
      totalPoints: Math.max(0, totalPoints),
      answeredCount,
      correctCount,
      wrongCount,
      totalResponseTimeMs,
      currentStreak,
      bestStreak,
      fastestResponseMs,
      lastSubmissionAt,
    },
  });
}

export const overrideScoreSchema = z.object({
  points: z.number().int().min(-10_000).max(10_000),
  note: z.string().max(500).nullish(),
});

/** Host-applied manual adjustment, recorded in the score ledger. */
export async function overrideParticipantScore(
  participantId: string,
  actorId: string,
  input: z.infer<typeof overrideScoreSchema>,
) {
  const participant = await prisma.tournamentParticipant.findUnique({ where: { id: participantId } });
  if (!participant) throw ApiError.notFound('Participant not found.');

  await prisma.$transaction(async (tx) => {
    await lockParticipantRow(tx, participantId);
    await tx.score.create({
      data: {
        tournamentId: participant.tournamentId,
        userId: participant.userId,
        participantId,
        points: input.points,
        reason: 'ADMIN_ADJUSTMENT',
        note: input.note ?? null,
      },
    });
    await recomputeParticipantAggregates(tx, participantId);
    await logTournamentEvent(
      {
        tournamentId: participant.tournamentId,
        type: TOURNAMENT_EVENT.SCORE_OVERRIDDEN,
        actorId,
        payload: { participantId, points: input.points, note: input.note ?? null },
      },
      tx,
    );
  });

  await invalidateLeaderboard(participant.tournamentId);
  await refreshRanks(participant.tournamentId, {});

  return prisma.tournamentParticipant.findUnique({ where: { id: participantId } });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listSubmissionsForQuestion(questionId: string) {
  const rows = await prisma.submission.findMany({
    where: { questionId },
    include: {
      user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      gradedBy: { select: { id: true, displayName: true } },
    },
    orderBy: [{ status: 'asc' }, { submittedAt: 'asc' }],
  });

  return rows.map((row) => ({
    id: row.id,
    user: row.user,
    answer: row.answer,
    uploadedImageUrl: row.uploadedImageUrl,
    submittedAt: row.submittedAt.toISOString(),
    responseTimeMs: row.responseTimeMs,
    outcome: row.outcome as SubmissionOutcomeDTO,
    awardedPoints: row.awardedPoints,
    status: row.status,
    feedback: row.feedback,
    gradedBy: row.gradedBy?.displayName ?? null,
  }));
}

export async function listPendingReview(tournamentId: string) {
  const rows = await prisma.submission.findMany({
    where: { tournamentId, status: 'PENDING_REVIEW' },
    include: {
      user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      question: { select: { id: true, order: true, prompt: true, basePoints: true } },
    },
    orderBy: { submittedAt: 'asc' },
  });

  return rows.map((row) => ({
    id: row.id,
    user: row.user,
    question: row.question,
    uploadedImageUrl: row.uploadedImageUrl,
    submittedAt: row.submittedAt.toISOString(),
    responseTimeMs: row.responseTimeMs,
    answer: row.answer,
  }));
}

export async function listMySubmissions(tournamentId: string, userId: string) {
  const rows = await prisma.submission.findMany({
    where: { tournamentId, userId },
    include: {
      question: {
        select: { id: true, order: true, prompt: true, type: true, status: true, explanation: true },
      },
    },
    orderBy: { question: { order: 'asc' } },
  });

  // Never expose grading detail for a question that is still open.
  return rows.map((row) => {
    const closed = row.question.status === 'CLOSED';
    return {
      id: row.id,
      questionId: row.questionId,
      questionOrder: row.question.order,
      questionPrompt: row.question.prompt,
      questionType: row.question.type,
      submittedAt: row.submittedAt.toISOString(),
      responseTimeMs: closed ? row.responseTimeMs : null,
      outcome: closed ? (row.outcome as SubmissionOutcomeDTO) : 'PENDING',
      awardedPoints: closed ? row.awardedPoints : 0,
      speedBonus: closed ? row.speedBonus : 0,
      feedback: closed ? row.feedback : null,
      explanation: closed ? row.question.explanation : null,
      uploadedImageUrl: row.uploadedImageUrl,
      status: row.status,
    };
  });
}
