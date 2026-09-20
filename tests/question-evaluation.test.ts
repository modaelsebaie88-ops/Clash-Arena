import { describe, expect, it } from 'vitest';
import type { Question, QuestionOption, QuestionType } from '@prisma/client';
import {
  buildReveal,
  evaluateAnswer,
  normaliseQuestionInput,
  questionInputSchema,
  toParticipantQuestion,
  type QuestionWithOptions,
} from '@/lib/services/question-service';

function option(text: string, isCorrect: boolean, order: number): QuestionOption {
  return {
    id: `opt-${order}-${text}`,
    questionId: 'q1',
    order,
    text,
    imageUrl: null,
    isCorrect,
  };
}

function question(
  type: QuestionType,
  overrides: Partial<Question> = {},
  options: QuestionOption[] = [],
): QuestionWithOptions {
  const base: Question = {
    id: 'q1',
    tournamentId: 't1',
    order: 0,
    type,
    prompt: 'Prompt',
    imageUrl: null,
    explanation: 'Because.',
    timeLimitSeconds: 30,
    basePoints: 100,
    speedBonusPoints: 50,
    answerKey: null,
    requiresManualGrading: false,
    status: 'ACTIVE',
    startedAt: new Date('2026-01-01T10:00:00Z'),
    endsAt: new Date('2026-01-01T10:00:30Z'),
    closedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  return { ...base, options };
}

describe('evaluateAnswer - multiple choice', () => {
  const mcq = question('MCQ', {}, [
    option('Alexandria', false, 0),
    option('Cairo', true, 1),
    option('Giza', false, 2),
  ]);

  it('marks the correct option correct', () => {
    const result = evaluateAnswer(mcq, { type: 'MCQ', optionId: 'opt-1-Cairo' });
    expect(result.outcome).toBe('CORRECT');
    expect(result.answerSummary).toBe('Cairo');
  });

  it('marks any other option incorrect', () => {
    expect(evaluateAnswer(mcq, { type: 'MCQ', optionId: 'opt-0-Alexandria' }).outcome).toBe(
      'INCORRECT',
    );
  });

  it('rejects an option that belongs to another question', () => {
    expect(() => evaluateAnswer(mcq, { type: 'MCQ', optionId: 'opt-9-Elsewhere' })).toThrowError(
      /does not belong to this question/,
    );
  });

  it('rejects an answer of the wrong type', () => {
    expect(() => evaluateAnswer(mcq, { type: 'NUMERIC', value: 4 })).toThrowError(
      /expects a MCQ answer/,
    );
  });
});

describe('evaluateAnswer - true or false', () => {
  const tf = question('TRUE_FALSE', { answerKey: { value: true } }, [
    option('True', true, 0),
    option('False', false, 1),
  ]);

  it('accepts the true option', () => {
    expect(evaluateAnswer(tf, { type: 'TRUE_FALSE', optionId: 'opt-0-True' }).outcome).toBe(
      'CORRECT',
    );
  });

  it('rejects the false option', () => {
    expect(evaluateAnswer(tf, { type: 'TRUE_FALSE', optionId: 'opt-1-False' }).outcome).toBe(
      'INCORRECT',
    );
  });
});

describe('evaluateAnswer - short answer', () => {
  const short = question('SHORT_ANSWER', {
    answerKey: { accepted: ['graphics processing unit', 'GPU'], caseSensitive: false },
  });

  it('ignores case and surrounding whitespace', () => {
    expect(
      evaluateAnswer(short, { type: 'SHORT_ANSWER', text: '  Graphics Processing Unit  ' }).outcome,
    ).toBe('CORRECT');
  });

  it('collapses runs of internal whitespace', () => {
    expect(
      evaluateAnswer(short, { type: 'SHORT_ANSWER', text: 'graphics   processing    unit' })
        .outcome,
    ).toBe('CORRECT');
  });

  it('accepts any listed alternative', () => {
    expect(evaluateAnswer(short, { type: 'SHORT_ANSWER', text: 'gpu' }).outcome).toBe('CORRECT');
  });

  it('rejects a different answer', () => {
    expect(
      evaluateAnswer(short, { type: 'SHORT_ANSWER', text: 'central processing unit' }).outcome,
    ).toBe('INCORRECT');
  });

  it('honours case sensitivity when the host asks for it', () => {
    const strict = question('SHORT_ANSWER', {
      answerKey: { accepted: ['DNA'], caseSensitive: true },
    });
    expect(evaluateAnswer(strict, { type: 'SHORT_ANSWER', text: 'DNA' }).outcome).toBe('CORRECT');
    expect(evaluateAnswer(strict, { type: 'SHORT_ANSWER', text: 'dna' }).outcome).toBe('INCORRECT');
  });
});

describe('evaluateAnswer - numeric', () => {
  it('accepts an exact match', () => {
    const numeric = question('NUMERIC', { answerKey: { value: 144, tolerance: 0 } });
    expect(evaluateAnswer(numeric, { type: 'NUMERIC', value: 144 }).outcome).toBe('CORRECT');
    expect(evaluateAnswer(numeric, { type: 'NUMERIC', value: 143 }).outcome).toBe('INCORRECT');
  });

  it('accepts anything inside the tolerance band', () => {
    const numeric = question('NUMERIC', { answerKey: { value: 80, tolerance: 0.5 } });
    expect(evaluateAnswer(numeric, { type: 'NUMERIC', value: 80.5 }).outcome).toBe('CORRECT');
    expect(evaluateAnswer(numeric, { type: 'NUMERIC', value: 79.5 }).outcome).toBe('CORRECT');
    expect(evaluateAnswer(numeric, { type: 'NUMERIC', value: 80.6 }).outcome).toBe('INCORRECT');
  });

  it('handles negative answers', () => {
    const numeric = question('NUMERIC', { answerKey: { value: -12, tolerance: 0 } });
    expect(evaluateAnswer(numeric, { type: 'NUMERIC', value: -12 }).outcome).toBe('CORRECT');
  });
});

describe('evaluateAnswer - photo submission', () => {
  it('defers to a human rather than guessing', () => {
    const image = question('IMAGE_SUBMISSION', { requiresManualGrading: true });
    const result = evaluateAnswer(image, { type: 'IMAGE_SUBMISSION', fileId: 'file-1' });

    expect(result.outcome).toBe('PENDING');
    expect(result.requiresManualGrading).toBe(true);
  });
});

describe('toParticipantQuestion', () => {
  const mcq = question('MCQ', { answerKey: { secret: 'do not leak' } }, [
    option('Alexandria', false, 0),
    option('Cairo', true, 1),
  ]);

  const dto = toParticipantQuestion(mcq, { index: 3, totalQuestions: 10 });

  it('never carries the answer key', () => {
    expect('answerKey' in dto).toBe(false);
    expect(JSON.stringify(dto)).not.toContain('do not leak');
  });

  it('never marks which option is correct', () => {
    for (const opt of dto.options) {
      expect('isCorrect' in opt).toBe(false);
    }
    expect(JSON.stringify(dto)).not.toContain('isCorrect');
  });

  it('never carries the explanation while the question is open', () => {
    expect('explanation' in dto).toBe(false);
    expect(JSON.stringify(dto)).not.toContain('Because.');
  });

  it('keeps the option text and order so the question is answerable', () => {
    expect(dto.options.map((o) => o.text)).toEqual(['Alexandria', 'Cairo']);
    expect(dto.index).toBe(3);
    expect(dto.totalQuestions).toBe(10);
  });

  it('exposes the absolute server deadline rather than a duration', () => {
    expect(dto.startedAt).toBe('2026-01-01T10:00:00.000Z');
    expect(dto.endsAt).toBe('2026-01-01T10:00:30.000Z');
  });

  it('flags a photo question as needing an upload', () => {
    const image = toParticipantQuestion(question('IMAGE_SUBMISSION'), {
      index: 1,
      totalQuestions: 1,
    });
    expect(image.requiresUpload).toBe(true);
  });
});

describe('buildReveal', () => {
  it('names the correct option for multiple choice', () => {
    const reveal = buildReveal(
      question('MCQ', {}, [option('Alexandria', false, 0), option('Cairo', true, 1)]),
    );
    expect(reveal.correctAnswerText).toBe('Cairo');
    expect(reveal.correctOptionIds).toEqual(['opt-1-Cairo']);
    expect(reveal.explanation).toBe('Because.');
  });

  it('lists every accepted short answer', () => {
    const reveal = buildReveal(
      question('SHORT_ANSWER', { answerKey: { accepted: ['GPU', 'graphics processing unit'] } }),
    );
    expect(reveal.correctAnswerText).toBe('GPU / graphics processing unit');
  });

  it('shows the tolerance band for a numeric answer', () => {
    expect(
      buildReveal(question('NUMERIC', { answerKey: { value: 80, tolerance: 0.5 } }))
        .correctAnswerText,
    ).toBe('80 (±0.5)');
    expect(
      buildReveal(question('NUMERIC', { answerKey: { value: 144, tolerance: 0 } }))
        .correctAnswerText,
    ).toBe('144');
  });
});

describe('question input validation', () => {
  const base = { prompt: 'A question', timeLimitSeconds: 30, basePoints: 100, speedBonusPoints: 50 };

  it('requires exactly one correct option on a multiple choice question', () => {
    const none = questionInputSchema.safeParse({
      ...base,
      type: 'MCQ',
      options: [
        { text: 'a', isCorrect: false },
        { text: 'b', isCorrect: false },
      ],
    });
    expect(none.success).toBe(false);

    const two = questionInputSchema.safeParse({
      ...base,
      type: 'MCQ',
      options: [
        { text: 'a', isCorrect: true },
        { text: 'b', isCorrect: true },
      ],
    });
    expect(two.success).toBe(false);

    const one = questionInputSchema.safeParse({
      ...base,
      type: 'MCQ',
      options: [
        { text: 'a', isCorrect: true },
        { text: 'b', isCorrect: false },
      ],
    });
    expect(one.success).toBe(true);
  });

  it('rejects a single-option multiple choice question', () => {
    const result = questionInputSchema.safeParse({
      ...base,
      type: 'MCQ',
      options: [{ text: 'only', isCorrect: true }],
    });
    expect(result.success).toBe(false);
  });

  it('requires at least one accepted answer for a short answer question', () => {
    expect(
      questionInputSchema.safeParse({ ...base, type: 'SHORT_ANSWER', acceptedAnswers: [] }).success,
    ).toBe(false);
  });

  it('rejects an out-of-range time limit', () => {
    expect(
      questionInputSchema.safeParse({ ...base, timeLimitSeconds: 2, type: 'TRUE_FALSE', correctValue: true })
        .success,
    ).toBe(false);
  });
});

describe('normaliseQuestionInput', () => {
  it('generates the two options for a true or false question', () => {
    const normalised = normaliseQuestionInput({
      type: 'TRUE_FALSE',
      prompt: 'Is it?',
      timeLimitSeconds: 30,
      basePoints: 100,
      speedBonusPoints: 50,
      correctValue: false,
      imageUrl: null,
      explanation: null,
    });

    expect(normalised.options.map((o) => o.text)).toEqual(['True', 'False']);
    expect(normalised.options.find((o) => o.text === 'False')?.isCorrect).toBe(true);
  });

  it('marks a photo question as needing manual grading', () => {
    const normalised = normaliseQuestionInput({
      type: 'IMAGE_SUBMISSION',
      prompt: 'Show your working',
      timeLimitSeconds: 120,
      basePoints: 150,
      speedBonusPoints: 0,
      imageUrl: null,
      explanation: null,
      instructions: 'Every step',
    });

    expect(normalised.requiresManualGrading).toBe(true);
    expect(normalised.options).toEqual([]);
  });
});
