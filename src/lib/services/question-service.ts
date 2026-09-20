import { Prisma, type Question, type QuestionOption, type QuestionType } from '@prisma/client';
import { z } from 'zod';
import { prisma, type Tx } from '../db';
import { ApiError } from '../http';
import type { AnswerPayload, ParticipantQuestionDTO, QuestionRevealDTO, SubmissionOutcomeDTO } from '@/types';

/**
 * Question handling is type-driven rather than MCQ-shaped: each question type
 * plugs in a validator, an evaluator and a reveal builder. Adding a new type
 * means adding one entry to each map below - no changes to the submission
 * pipeline, the scoring service or the UI plumbing.
 */

export type QuestionWithOptions = Question & { options: QuestionOption[] };

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const optionInput = z.object({
  id: z.string().optional(),
  text: z.string().trim().min(1, 'Option text is required').max(500),
  imageUrl: z.string().max(1000).nullish(),
  isCorrect: z.boolean().default(false),
});

const baseQuestionFields = {
  prompt: z.string().trim().min(3, 'Question text is required').max(4000),
  imageUrl: z.string().max(1000).nullish(),
  explanation: z.string().max(4000).nullish(),
  timeLimitSeconds: z.number().int().min(5).max(600).default(30),
  basePoints: z.number().int().min(0).max(10_000).default(100),
  speedBonusPoints: z.number().int().min(0).max(10_000).default(50),
};

export const questionInputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('MCQ'),
    ...baseQuestionFields,
    options: z
      .array(optionInput)
      .min(2, 'Add at least two options')
      .max(8, 'Eight options maximum')
      .refine((opts) => opts.filter((o) => o.isCorrect).length === 1, {
        message: 'Mark exactly one option as correct',
      }),
  }),
  z.object({
    type: z.literal('TRUE_FALSE'),
    ...baseQuestionFields,
    correctValue: z.boolean(),
  }),
  z.object({
    type: z.literal('SHORT_ANSWER'),
    ...baseQuestionFields,
    acceptedAnswers: z
      .array(z.string().trim().min(1))
      .min(1, 'Add at least one accepted answer')
      .max(20),
    caseSensitive: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('NUMERIC'),
    ...baseQuestionFields,
    correctNumber: z.number(),
    tolerance: z.number().min(0).default(0),
  }),
  z.object({
    type: z.literal('IMAGE_SUBMISSION'),
    ...baseQuestionFields,
    instructions: z.string().max(2000).nullish(),
  }),
]);

export type QuestionInput = z.infer<typeof questionInputSchema>;

interface NormalisedQuestion {
  type: QuestionType;
  prompt: string;
  imageUrl: string | null;
  explanation: string | null;
  timeLimitSeconds: number;
  basePoints: number;
  speedBonusPoints: number;
  requiresManualGrading: boolean;
  answerKey: Prisma.InputJsonValue | null;
  options: Array<{ text: string; imageUrl: string | null; isCorrect: boolean; order: number }>;
}

/** Turns validated input into the storage shape, including generated options. */
export function normaliseQuestionInput(input: QuestionInput): NormalisedQuestion {
  const shared = {
    prompt: input.prompt,
    imageUrl: input.imageUrl ?? null,
    explanation: input.explanation ?? null,
    timeLimitSeconds: input.timeLimitSeconds,
    basePoints: input.basePoints,
    speedBonusPoints: input.speedBonusPoints,
  };

  switch (input.type) {
    case 'MCQ':
      return {
        ...shared,
        type: 'MCQ',
        requiresManualGrading: false,
        answerKey: null,
        options: input.options.map((option, index) => ({
          text: option.text,
          imageUrl: option.imageUrl ?? null,
          isCorrect: option.isCorrect,
          order: index,
        })),
      };
    case 'TRUE_FALSE':
      return {
        ...shared,
        type: 'TRUE_FALSE',
        requiresManualGrading: false,
        answerKey: { value: input.correctValue },
        options: [
          { text: 'True', imageUrl: null, isCorrect: input.correctValue === true, order: 0 },
          { text: 'False', imageUrl: null, isCorrect: input.correctValue === false, order: 1 },
        ],
      };
    case 'SHORT_ANSWER':
      return {
        ...shared,
        type: 'SHORT_ANSWER',
        requiresManualGrading: false,
        answerKey: { accepted: input.acceptedAnswers, caseSensitive: input.caseSensitive },
        options: [],
      };
    case 'NUMERIC':
      return {
        ...shared,
        type: 'NUMERIC',
        requiresManualGrading: false,
        answerKey: { value: input.correctNumber, tolerance: input.tolerance },
        options: [],
      };
    case 'IMAGE_SUBMISSION':
      return {
        ...shared,
        type: 'IMAGE_SUBMISSION',
        requiresManualGrading: true,
        answerKey: input.instructions ? { instructions: input.instructions } : null,
        options: [],
      };
    default: {
      const exhaustive: never = input;
      throw ApiError.badRequest(`Unsupported question type: ${JSON.stringify(exhaustive)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listQuestions(tournamentId: string): Promise<QuestionWithOptions[]> {
  return prisma.question.findMany({
    where: { tournamentId },
    include: { options: { orderBy: { order: 'asc' } } },
    orderBy: { order: 'asc' },
  });
}

export async function getQuestionOrThrow(questionId: string): Promise<QuestionWithOptions> {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: { options: { orderBy: { order: 'asc' } } },
  });
  if (!question) throw ApiError.notFound('Question not found.');
  return question;
}

export async function createQuestion(
  tournamentId: string,
  input: QuestionInput,
): Promise<QuestionWithOptions> {
  const normalised = normaliseQuestionInput(input);

  return prisma.$transaction(async (tx) => {
    const last = await tx.question.findFirst({
      where: { tournamentId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const order = (last?.order ?? -1) + 1;

    return tx.question.create({
      data: {
        tournamentId,
        order,
        type: normalised.type,
        prompt: normalised.prompt,
        imageUrl: normalised.imageUrl,
        explanation: normalised.explanation,
        timeLimitSeconds: normalised.timeLimitSeconds,
        basePoints: normalised.basePoints,
        speedBonusPoints: normalised.speedBonusPoints,
        requiresManualGrading: normalised.requiresManualGrading,
        answerKey: normalised.answerKey ?? Prisma.DbNull,
        options: { create: normalised.options },
      },
      include: { options: { orderBy: { order: 'asc' } } },
    });
  });
}

export async function updateQuestion(
  questionId: string,
  input: QuestionInput,
): Promise<QuestionWithOptions> {
  const existing = await getQuestionOrThrow(questionId);
  if (existing.status !== 'UPCOMING') {
    throw ApiError.invalidState('A question cannot be edited once it has gone live.');
  }

  const normalised = normaliseQuestionInput(input);

  return prisma.$transaction(async (tx) => {
    await tx.questionOption.deleteMany({ where: { questionId } });
    return tx.question.update({
      where: { id: questionId },
      data: {
        type: normalised.type,
        prompt: normalised.prompt,
        imageUrl: normalised.imageUrl,
        explanation: normalised.explanation,
        timeLimitSeconds: normalised.timeLimitSeconds,
        basePoints: normalised.basePoints,
        speedBonusPoints: normalised.speedBonusPoints,
        requiresManualGrading: normalised.requiresManualGrading,
        answerKey: normalised.answerKey ?? Prisma.DbNull,
        options: { create: normalised.options },
      },
      include: { options: { orderBy: { order: 'asc' } } },
    });
  });
}

export async function deleteQuestion(questionId: string): Promise<void> {
  const question = await getQuestionOrThrow(questionId);
  if (question.status !== 'UPCOMING') {
    throw ApiError.invalidState('A question that has already been played cannot be deleted.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.question.delete({ where: { id: questionId } });
    // Close the gap so orders stay contiguous.
    const remaining = await tx.question.findMany({
      where: { tournamentId: question.tournamentId },
      orderBy: { order: 'asc' },
      select: { id: true },
    });
    await applyOrder(tx, remaining.map((q) => q.id));
  });
}

/**
 * Two-phase write: orders are pushed into a negative range first so the
 * (tournamentId, order) unique constraint can never be violated mid-update.
 */
async function applyOrder(tx: Tx, orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i += 1) {
    await tx.question.update({ where: { id: orderedIds[i] }, data: { order: -(i + 1) } });
  }
  for (let i = 0; i < orderedIds.length; i += 1) {
    await tx.question.update({ where: { id: orderedIds[i] }, data: { order: i } });
  }
}

export async function reorderQuestions(tournamentId: string, orderedIds: string[]): Promise<void> {
  const existing = await prisma.question.findMany({
    where: { tournamentId },
    select: { id: true, status: true },
  });

  if (existing.some((q) => q.status !== 'UPCOMING')) {
    throw ApiError.invalidState('Questions cannot be reordered after the tournament has started.');
  }

  const existingIds = new Set(existing.map((q) => q.id));
  if (orderedIds.length !== existingIds.size || orderedIds.some((id) => !existingIds.has(id))) {
    throw ApiError.badRequest('The new order must list every question exactly once.');
  }

  await prisma.$transaction((tx) => applyOrder(tx, orderedIds));
}

// ---------------------------------------------------------------------------
// Serialisation (what a participant is allowed to see)
// ---------------------------------------------------------------------------

/**
 * Strips the answer key, per-option correctness and the explanation. This is
 * the only shape ever sent to a participant while a question is open.
 */
export function toParticipantQuestion(
  question: QuestionWithOptions,
  context: { index: number; totalQuestions: number },
): ParticipantQuestionDTO {
  return {
    id: question.id,
    order: question.order,
    index: context.index,
    totalQuestions: context.totalQuestions,
    type: question.type,
    prompt: question.prompt,
    imageUrl: question.imageUrl,
    timeLimitSeconds: question.timeLimitSeconds,
    basePoints: question.basePoints,
    speedBonusPoints: question.speedBonusPoints,
    status: question.status,
    startedAt: question.startedAt ? question.startedAt.toISOString() : null,
    endsAt: question.endsAt ? question.endsAt.toISOString() : null,
    options: question.options.map((option) => ({
      id: option.id,
      order: option.order,
      text: option.text,
      imageUrl: option.imageUrl,
    })),
    requiresUpload: question.type === 'IMAGE_SUBMISSION',
    requiresManualGrading: question.requiresManualGrading,
  };
}

/** Only called once a question is CLOSED. */
export function buildReveal(question: QuestionWithOptions): QuestionRevealDTO {
  const key = (question.answerKey ?? null) as Record<string, unknown> | null;

  let correctAnswerText: string | null = null;
  if (question.type === 'MCQ' || question.type === 'TRUE_FALSE') {
    correctAnswerText = question.options.find((o) => o.isCorrect)?.text ?? null;
  } else if (question.type === 'SHORT_ANSWER') {
    const accepted = Array.isArray(key?.accepted) ? (key?.accepted as string[]) : [];
    correctAnswerText = accepted.join(' / ') || null;
  } else if (question.type === 'NUMERIC') {
    const value = typeof key?.value === 'number' ? key.value : null;
    const tolerance = typeof key?.tolerance === 'number' ? key.tolerance : 0;
    correctAnswerText = value === null ? null : tolerance > 0 ? `${value} (±${tolerance})` : `${value}`;
  } else if (question.type === 'IMAGE_SUBMISSION') {
    correctAnswerText = 'Reviewed by the host';
  }

  return {
    questionId: question.id,
    correctOptionIds: question.options.filter((o) => o.isCorrect).map((o) => o.id),
    correctAnswerText,
    explanation: question.explanation,
  };
}

// ---------------------------------------------------------------------------
// Answer evaluation
// ---------------------------------------------------------------------------

export interface EvaluationResult {
  outcome: SubmissionOutcomeDTO;
  /** Human readable echo of what the player answered. */
  answerSummary: string | null;
  requiresManualGrading: boolean;
}

function normaliseText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/** Validates that the payload matches the question type, then grades it. */
export function evaluateAnswer(
  question: QuestionWithOptions,
  answer: AnswerPayload,
): EvaluationResult {
  if (answer.type !== question.type) {
    throw ApiError.badRequest(
      `This question expects a ${question.type} answer, received ${answer.type}.`,
    );
  }

  const key = (question.answerKey ?? null) as Record<string, unknown> | null;

  switch (question.type) {
    case 'MCQ':
    case 'TRUE_FALSE': {
      const optionId = (answer as { optionId: string }).optionId;
      const option = question.options.find((o) => o.id === optionId);
      if (!option) throw ApiError.badRequest('That option does not belong to this question.');
      return {
        outcome: option.isCorrect ? 'CORRECT' : 'INCORRECT',
        answerSummary: option.text,
        requiresManualGrading: false,
      };
    }

    case 'SHORT_ANSWER': {
      const text = (answer as { text: string }).text;
      const accepted = Array.isArray(key?.accepted) ? (key?.accepted as string[]) : [];
      const caseSensitive = Boolean(key?.caseSensitive);
      const candidate = normaliseText(text);
      const matches = accepted.some((expected) => {
        const target = normaliseText(expected);
        return caseSensitive
          ? target === candidate
          : target.toLowerCase() === candidate.toLowerCase();
      });
      return {
        outcome: matches ? 'CORRECT' : 'INCORRECT',
        answerSummary: candidate,
        requiresManualGrading: false,
      };
    }

    case 'NUMERIC': {
      const value = (answer as { value: number }).value;
      const expected = typeof key?.value === 'number' ? key.value : null;
      const tolerance = typeof key?.tolerance === 'number' ? key.tolerance : 0;
      if (expected === null) {
        return { outcome: 'PENDING', answerSummary: String(value), requiresManualGrading: true };
      }
      return {
        outcome: Math.abs(value - expected) <= tolerance ? 'CORRECT' : 'INCORRECT',
        answerSummary: String(value),
        requiresManualGrading: false,
      };
    }

    case 'IMAGE_SUBMISSION': {
      // Graded by the host from the admin console. The architecture seam for an
      // AI grader is exactly here: produce a suggested outcome plus confidence
      // and leave the final call to the host.
      return {
        outcome: 'PENDING',
        answerSummary: 'Photo of handwritten solution',
        requiresManualGrading: true,
      };
    }

    default: {
      throw ApiError.badRequest('Unsupported question type.');
    }
  }
}

/** Shape used by the admin question list and the question builder. */
export function toAdminQuestion(question: QuestionWithOptions) {
  return {
    id: question.id,
    order: question.order,
    type: question.type,
    prompt: question.prompt,
    imageUrl: question.imageUrl,
    explanation: question.explanation,
    timeLimitSeconds: question.timeLimitSeconds,
    basePoints: question.basePoints,
    speedBonusPoints: question.speedBonusPoints,
    requiresManualGrading: question.requiresManualGrading,
    status: question.status,
    answerKey: question.answerKey,
    options: question.options.map((o) => ({
      id: o.id,
      order: o.order,
      text: o.text,
      imageUrl: o.imageUrl,
      isCorrect: o.isCorrect,
    })),
  };
}

export type AdminQuestionDTO = ReturnType<typeof toAdminQuestion>;
