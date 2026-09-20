'use client';

import * as React from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Stepper, Switch, Textarea } from '@/components/ui/field';
import { Sheet, Segmented } from '@/components/ui/sheet';
import { Kicker, RoundPips, Tag } from '@/components/ui/primitives';
import { AnswerDeck } from '@/components/tournament/answer-deck';
import { ArenaClock } from '@/components/tournament/timer';
import { PhotoCapture } from '@/components/tournament/photo-capture';
import { cn } from '@/lib/utils';
import type { ParticipantQuestionDTO, QuestionTypeDTO } from '@/types';

export interface AdminQuestion {
  id: string;
  order: number;
  type: QuestionTypeDTO;
  prompt: string;
  imageUrl: string | null;
  explanation: string | null;
  timeLimitSeconds: number;
  basePoints: number;
  speedBonusPoints: number;
  requiresManualGrading: boolean;
  status: 'UPCOMING' | 'ACTIVE' | 'CLOSED';
  answerKey: unknown;
  options: Array<{ id: string; order: number; text: string; imageUrl: string | null; isCorrect: boolean }>;
}

export interface QuestionDraft {
  type: QuestionTypeDTO;
  prompt: string;
  imageUrl: string;
  explanation: string;
  timeLimitSeconds: number;
  basePoints: number;
  speedBonusPoints: number;
  options: Array<{ text: string; isCorrect: boolean }>;
  correctValue: boolean;
  acceptedAnswers: string;
  caseSensitive: boolean;
  correctNumber: string;
  tolerance: string;
  instructions: string;
}

export const QUESTION_TYPES: Array<{ value: QuestionTypeDTO; label: string; hint: string }> = [
  { value: 'MCQ', label: 'Multiple choice', hint: 'Four options, one right answer' },
  { value: 'TRUE_FALSE', label: 'True / false', hint: 'Fastest round type' },
  { value: 'SHORT_ANSWER', label: 'Short answer', hint: 'Typed, matched against a list' },
  { value: 'NUMERIC', label: 'Numeric', hint: 'A number, with optional tolerance' },
  { value: 'IMAGE_SUBMISSION', label: 'Show your work', hint: 'Photo of written work, you score it' },
];

export const QUESTION_TYPE_LABELS: Record<QuestionTypeDTO, string> = Object.fromEntries(
  QUESTION_TYPES.map((type) => [type.value, type.label]),
) as Record<QuestionTypeDTO, string>;

export function emptyDraft(defaults: {
  timeLimitSeconds: number;
  basePoints: number;
  speedBonusPoints?: number;
}): QuestionDraft {
  return {
    type: 'MCQ',
    prompt: '',
    imageUrl: '',
    explanation: '',
    timeLimitSeconds: defaults.timeLimitSeconds,
    basePoints: defaults.basePoints,
    speedBonusPoints: defaults.speedBonusPoints ?? 50,
    options: [
      { text: '', isCorrect: true },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
    ],
    correctValue: true,
    acceptedAnswers: '',
    caseSensitive: false,
    correctNumber: '',
    tolerance: '0',
    instructions: '',
  };
}

export function draftFromQuestion(question: AdminQuestion): QuestionDraft {
  const key = (question.answerKey ?? {}) as Record<string, unknown>;

  return {
    type: question.type,
    prompt: question.prompt,
    imageUrl: question.imageUrl ?? '',
    explanation: question.explanation ?? '',
    timeLimitSeconds: question.timeLimitSeconds,
    basePoints: question.basePoints,
    speedBonusPoints: question.speedBonusPoints,
    options: question.options.length
      ? question.options.map((option) => ({ text: option.text, isCorrect: option.isCorrect }))
      : [
          { text: '', isCorrect: true },
          { text: '', isCorrect: false },
        ],
    correctValue: typeof key.value === 'boolean' ? key.value : true,
    acceptedAnswers: Array.isArray(key.accepted) ? (key.accepted as string[]).join(', ') : '',
    caseSensitive: Boolean(key.caseSensitive),
    correctNumber: typeof key.value === 'number' ? String(key.value) : '',
    tolerance: typeof key.tolerance === 'number' ? String(key.tolerance) : '0',
    instructions: typeof key.instructions === 'string' ? key.instructions : '',
  };
}

export function draftToPayload(draft: QuestionDraft): Record<string, unknown> {
  const base = {
    type: draft.type,
    prompt: draft.prompt.trim(),
    imageUrl: draft.imageUrl || null,
    explanation: draft.explanation || null,
    timeLimitSeconds: draft.timeLimitSeconds,
    basePoints: draft.basePoints,
    speedBonusPoints: draft.speedBonusPoints,
  };

  switch (draft.type) {
    case 'MCQ':
      return {
        ...base,
        options: draft.options
          .filter((option) => option.text.trim())
          .map((option) => ({ text: option.text.trim(), isCorrect: option.isCorrect })),
      };
    case 'TRUE_FALSE':
      return { ...base, correctValue: draft.correctValue };
    case 'SHORT_ANSWER':
      return {
        ...base,
        acceptedAnswers: draft.acceptedAnswers
          .split(',')
          .map((answer) => answer.trim())
          .filter(Boolean),
        caseSensitive: draft.caseSensitive,
      };
    case 'NUMERIC':
      return {
        ...base,
        correctNumber: Number(draft.correctNumber),
        tolerance: Number(draft.tolerance || 0),
      };
    default:
      return { ...base, instructions: draft.instructions || null };
  }
}

/** Build the exact payload a player would receive, for the preview. */
function draftToParticipantQuestion(draft: QuestionDraft, index: number, total: number): ParticipantQuestionDTO {
  const options =
    draft.type === 'MCQ'
      ? draft.options
          .filter((option) => option.text.trim())
          .map((option, position) => ({
            id: `preview-${position}`,
            order: position,
            text: option.text,
            imageUrl: null,
          }))
      : draft.type === 'TRUE_FALSE'
        ? [
            { id: 'preview-true', order: 0, text: 'True', imageUrl: null },
            { id: 'preview-false', order: 1, text: 'False', imageUrl: null },
          ]
        : [];

  return {
    id: 'preview',
    order: index - 1,
    index,
    totalQuestions: total,
    type: draft.type,
    prompt: draft.prompt || 'Your question appears here',
    imageUrl: draft.imageUrl || null,
    timeLimitSeconds: draft.timeLimitSeconds,
    basePoints: draft.basePoints,
    speedBonusPoints: draft.speedBonusPoints,
    status: 'ACTIVE',
    startedAt: null,
    endsAt: null,
    options,
    requiresUpload: draft.type === 'IMAGE_SUBMISSION',
    requiresManualGrading: draft.type === 'IMAGE_SUBMISSION',
  };
}

/* ------------------------------------------------------------------ */

export function QuestionBuilder({
  open,
  onClose,
  draft,
  onChange,
  onSave,
  saving,
  errors,
  editing,
  roundIndex,
  roundTotal,
}: {
  open: boolean;
  onClose: () => void;
  draft: QuestionDraft;
  onChange: (next: QuestionDraft) => void;
  onSave: () => void;
  saving?: boolean;
  errors?: Record<string, string>;
  editing: boolean;
  roundIndex: number;
  roundTotal: number;
}) {
  const [pane, setPane] = React.useState<'write' | 'preview'>('write');

  const set = <K extends keyof QuestionDraft>(key: K, value: QuestionDraft[K]) =>
    onChange({ ...draft, [key]: value });

  const markCorrect = (index: number) =>
    set(
      'options',
      draft.options.map((option, position) => ({ ...option, isCorrect: position === index })),
    );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="lg"
      kicker={`Round ${String(roundIndex).padStart(2, '0')}`}
      title={editing ? 'Edit round' : 'Build a round'}
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" className="flex-1" onClick={onSave} loading={saving}>
            {editing ? 'Save round' : 'Add round'}
          </Button>
        </>
      }
    >
      {/* On narrow screens the preview is a tab; on wide it sits side by side. */}
      <Segmented
        className="mb-5 lg:hidden"
        value={pane}
        onChange={(value) => setPane(value as 'write' | 'preview')}
        tabs={[
          { value: 'write', label: 'Write' },
          { value: 'preview', label: 'Phone preview' },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className={cn('space-y-5', pane === 'preview' && 'hidden lg:block')}>
          <Field label="Round type" required>
            <Select
              value={draft.type}
              onChange={(event) => set('type', event.target.value as QuestionTypeDTO)}
            >
              {QUESTION_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Question" required error={errors?.prompt}>
            <Textarea
              value={draft.prompt}
              onChange={(event) => set('prompt', event.target.value)}
              placeholder="What is the capital of Egypt?"
              required
            />
          </Field>

          {draft.type === 'MCQ' ? (
            <Field
              label="Options"
              required
              error={errors?.options}
              hint="Tap the circle to mark the right answer."
            >
              <div className="space-y-2">
                {draft.options.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => markCorrect(index)}
                      aria-label={`Mark option ${String.fromCharCode(65 + index)} correct`}
                      className={cn(
                        'grid h-11 w-11 shrink-0 place-items-center rounded-sm border-2 transition-colors',
                        option.isCorrect
                          ? 'border-win bg-win text-volt-ink'
                          : 'border-rail text-ghost hover:border-win/60',
                      )}
                    >
                      {option.isCorrect ? (
                        <Check className="h-5 w-5" strokeWidth={3} />
                      ) : (
                        <span className="font-data text-[13px] font-black">
                          {String.fromCharCode(65 + index)}
                        </span>
                      )}
                    </button>

                    <Input
                      value={option.text}
                      onChange={(event) => {
                        const options = [...draft.options];
                        options[index] = { ...options[index], text: event.target.value };
                        set('options', options);
                      }}
                      placeholder={`Option ${String.fromCharCode(65 + index)}`}
                    />

                    {draft.options.length > 2 ? (
                      <button
                        type="button"
                        aria-label="Remove option"
                        onClick={() =>
                          set(
                            'options',
                            draft.options.filter((_, position) => position !== index),
                          )
                        }
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-sm text-ghost transition-colors hover:bg-deck hover:text-loss"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                ))}

                {draft.options.length < 8 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="steel"
                    onClick={() => set('options', [...draft.options, { text: '', isCorrect: false }])}
                  >
                    <Plus className="h-4 w-4" />
                    Add option
                  </Button>
                ) : null}
              </div>
            </Field>
          ) : null}

          {draft.type === 'TRUE_FALSE' ? (
            <Field label="Correct answer" required>
              <div className="grid grid-cols-2 gap-2">
                {[true, false].map((value) => (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => set('correctValue', value)}
                    className={cn(
                      'min-h-[52px] rounded-md border-2 font-data text-[14px] font-extrabold uppercase tracking-[0.1em] transition-colors',
                      draft.correctValue === value
                        ? 'border-win bg-win/15 text-win'
                        : 'border-rail text-smoke hover:border-smoke',
                    )}
                  >
                    {value ? 'True' : 'False'}
                  </button>
                ))}
              </div>
            </Field>
          ) : null}

          {draft.type === 'SHORT_ANSWER' ? (
            <>
              <Field
                label="Accepted answers"
                required
                error={errors?.acceptedAnswers}
                hint="Comma separated. Case and extra spacing are ignored unless you say otherwise."
              >
                <Input
                  value={draft.acceptedAnswers}
                  onChange={(event) => set('acceptedAnswers', event.target.value)}
                  placeholder="graphics processing unit, gpu"
                />
              </Field>
              <Switch
                checked={draft.caseSensitive}
                onChange={(value) => set('caseSensitive', value)}
                label="Case sensitive"
                description="Require exact capitalisation"
              />
            </>
          ) : null}

          {draft.type === 'NUMERIC' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Correct number" required error={errors?.correctNumber}>
                <Input
                  type="number"
                  step="any"
                  value={draft.correctNumber}
                  onChange={(event) => set('correctNumber', event.target.value)}
                  required
                />
              </Field>
              <Field label="Tolerance" hint="Anything within this range counts.">
                <Input
                  type="number"
                  step="any"
                  min={0}
                  value={draft.tolerance}
                  onChange={(event) => set('tolerance', event.target.value)}
                />
              </Field>
            </div>
          ) : null}

          {draft.type === 'IMAGE_SUBMISSION' ? (
            <Field label="Instructions" hint="You score these by hand from the control room.">
              <Textarea
                value={draft.instructions}
                onChange={(event) => set('instructions', event.target.value)}
                placeholder="Show every step of your working."
              />
            </Field>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Seconds">
              <Stepper
                value={draft.timeLimitSeconds}
                onChange={(value) => set('timeLimitSeconds', value)}
                min={5}
                max={600}
                step={5}
                suffix="s"
              />
            </Field>
            <Field label="Base points">
              <Stepper
                value={draft.basePoints}
                onChange={(value) => set('basePoints', value)}
                min={0}
                max={10000}
                step={10}
              />
            </Field>
            <Field label="Speed bonus">
              <Stepper
                value={draft.speedBonusPoints}
                onChange={(value) => set('speedBonusPoints', value)}
                min={0}
                max={10000}
                step={10}
              />
            </Field>
          </div>

          <Field label="Explanation" hint="Shown to players once the round closes.">
            <Textarea
              value={draft.explanation}
              onChange={(event) => set('explanation', event.target.value)}
              placeholder="Cairo has been the capital since 1168."
            />
          </Field>

          <Field label="Question image" hint="Optional diagram shown above the question.">
            <PhotoCapture purpose="QUESTION" onChange={(file) => set('imageUrl', file?.url ?? '')} />
          </Field>

          {errors?.form ? <p className="text-[13px] text-loss">{errors.form}</p> : null}
        </div>

        {/* ---- the preview ------------------------------------------- */}
        <div className={cn(pane === 'write' && 'hidden lg:block')}>
          <div className="lg:sticky lg:top-0">
            <Kicker className="mb-3">Exactly what a player sees</Kicker>
            <PhonePreview draft={draft} roundIndex={roundIndex} roundTotal={roundTotal} />
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/**
 * A real phone frame rendering the real player components, so what the host
 * previews is what the room gets. The clock is frozen at full time.
 */
export function PhonePreview({
  draft,
  roundIndex,
  roundTotal,
}: {
  draft: QuestionDraft;
  roundIndex: number;
  roundTotal: number;
}) {
  const question = draftToParticipantQuestion(draft, roundIndex, roundTotal);
  const totalMs = draft.timeLimitSeconds * 1000;

  return (
    <div className="mx-auto w-[300px] overflow-hidden rounded-[28px] border-4 border-ridge bg-ink shadow-lift">
      {/* Status strip */}
      <div className="border-b border-rail px-4 pb-2 pt-4">
        <div className="flex items-center justify-between">
          <span className="font-data text-[9px] font-bold uppercase tracking-[0.12em] text-ghost">
            Arena
          </span>
          <span className="font-data text-[9px] uppercase tracking-[0.14em] text-ghost tnum">
            Round {String(roundIndex).padStart(2, '0')} / {roundTotal || 1}
          </span>
        </div>
        <RoundPips total={Math.max(1, roundTotal)} current={roundIndex} className="mt-2" />
      </div>
      <div className="h-1 bg-volt" aria-hidden />

      <div className="max-h-[520px] overflow-y-auto px-4 py-5">
        <div className="flex flex-col items-center">
          <ArenaClock msRemaining={totalMs} totalMs={totalMs} />
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            <Tag tone="volt">{draft.basePoints} pts</Tag>
            {draft.speedBonusPoints > 0 ? (
              <Tag tone="blaze">+{draft.speedBonusPoints} speed</Tag>
            ) : null}
          </div>
        </div>

        <h3 className="mt-5 text-center text-[17px] font-semibold leading-snug text-chalk">
          {question.prompt}
        </h3>

        {question.imageUrl ? (
          <img
            src={question.imageUrl}
            alt=""
            className="mx-auto mt-3 max-h-32 rounded-sm border border-rail object-contain"
          />
        ) : null}

        <div className="mt-5">
          {/* Interactive on purpose: the host can feel the tap targets. */}
          <AnswerDeck question={question} onSubmit={async () => {}} submitted={false} />
        </div>
      </div>
    </div>
  );
}
