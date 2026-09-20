'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Stepper, Switch, Textarea } from '@/components/ui/field';
import { Kicker, RuleLabel, Tag } from '@/components/ui/primitives';
import { PhotoCapture } from '@/components/tournament/photo-capture';
import { previewScoreCurve } from '@/lib/services/scoring-service';
import { cn } from '@/lib/utils';
import type { ScoringConfigDTO, TieBreakerKey } from '@/types';

export interface TournamentFormValues {
  name: string;
  description: string;
  coverImageUrl: string;
  rules: string;
  startAt: string;
  maxParticipants: number;
  joinByCodeEnabled: boolean;
  requireApproval: boolean;
  allowLateJoin: boolean;
  showLeaderboardAfterQuestion: boolean;
  showAnswersToParticipants: boolean;
  defaultTimeLimitSeconds: number;
  defaultBasePoints: number;
  scoringConfig: ScoringConfigDTO;
  tieBreakers: TieBreakerKey[];
}

export const DEFAULT_FORM: TournamentFormValues = {
  name: '',
  description: '',
  coverImageUrl: '',
  rules: '',
  startAt: '',
  maxParticipants: 200,
  joinByCodeEnabled: true,
  requireApproval: false,
  allowLateJoin: true,
  showLeaderboardAfterQuestion: true,
  showAnswersToParticipants: true,
  defaultTimeLimitSeconds: 30,
  defaultBasePoints: 100,
  scoringConfig: {
    formula: 'LINEAR_SPEED_BONUS',
    correctPoints: 100,
    speedBonusEnabled: true,
    speedBonusPoints: 50,
    wrongAnswerPoints: 0,
    noAnswerPoints: 0,
    partialCreditEnabled: true,
    streakBonusEnabled: true,
    streakBonusPoints: 10,
    streakBonusCap: 50,
    minimumSpeedRatio: 0,
  },
  tieBreakers: ['TOTAL_POINTS', 'CORRECT_COUNT', 'TOTAL_RESPONSE_TIME', 'EARLIEST_LAST_SUBMISSION'],
};

const TIE_LABELS: Record<TieBreakerKey, string> = {
  TOTAL_POINTS: 'Points',
  CORRECT_COUNT: 'Correct answers',
  TOTAL_RESPONSE_TIME: 'Total response time',
  EARLIEST_LAST_SUBMISSION: 'Earliest finish',
  BEST_STREAK: 'Best streak',
};

/** ISO string into the value a datetime-local input expects. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function TournamentForm({
  value,
  onChange,
  onSubmit,
  saving,
  errors,
  submitLabel = 'Save',
  disabled,
}: {
  value: TournamentFormValues;
  onChange: (next: TournamentFormValues) => void;
  onSubmit: () => void;
  saving?: boolean;
  errors?: Record<string, string>;
  submitLabel?: string;
  disabled?: boolean;
}) {
  const set = <K extends keyof TournamentFormValues>(key: K, next: TournamentFormValues[K]) =>
    onChange({ ...value, [key]: next });

  const setScoring = <K extends keyof ScoringConfigDTO>(key: K, next: ScoringConfigDTO[K]) =>
    onChange({ ...value, scoringConfig: { ...value.scoringConfig, [key]: next } });

  const preview = previewScoreCurve(
    value.scoringConfig,
    value.defaultTimeLimitSeconds,
    value.scoringConfig.correctPoints,
  );

  return (
    <form
      className="space-y-section"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {/* ---- identity --------------------------------------------- */}
      <section>
        <RuleLabel className="mb-5">The event</RuleLabel>

        <div className="space-y-4">
          <Field label="Tournament name" required error={errors?.name}>
            <Input
              value={value.name}
              onChange={(event) => set('name', event.target.value)}
              placeholder="AI Challenge 2026"
              disabled={disabled}
              required
            />
          </Field>

          <Field label="Description" error={errors?.description}>
            <Textarea
              value={value.description}
              onChange={(event) => set('description', event.target.value)}
              placeholder="Ten rapid-fire rounds. Fastest correct answers take the crown."
              disabled={disabled}
            />
          </Field>

          <Field label="Rules" hint="Shown on the brief before players enter." error={errors?.rules}>
            <Textarea
              value={value.rules}
              onChange={(event) => set('rules', event.target.value)}
              placeholder="One answer per round. Speed counts."
              disabled={disabled}
            />
          </Field>

          <Field label="Cover art" hint="Optional banner across the tournament poster.">
            <PhotoCapture
              purpose="COVER"
              disabled={disabled}
              onChange={(file) => set('coverImageUrl', file?.url ?? '')}
            />
          </Field>
        </div>
      </section>

      {/* ---- scoring ---------------------------------------------- */}
      <section>
        <RuleLabel className="mb-5">Scoring</RuleLabel>

        <div className="space-y-4">
          <Field label="Speed curve" hint="How the bonus drains across the clock.">
            <Select
              value={value.scoringConfig.formula}
              onChange={(event) =>
                setScoring('formula', event.target.value as ScoringConfigDTO['formula'])
              }
              disabled={disabled}
            >
              <option value="LINEAR_SPEED_BONUS">Linear decay</option>
              <option value="STEPPED_SPEED_BONUS">Stepped brackets</option>
              <option value="FLAT">Flat, no speed bonus</option>
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Correct answer" required>
              <Stepper
                value={value.scoringConfig.correctPoints}
                onChange={(next) => setScoring('correctPoints', next)}
                min={0}
                max={10000}
                step={10}
                suffix="pts"
              />
            </Field>

            <Field label="Max speed bonus">
              <Stepper
                value={value.scoringConfig.speedBonusPoints}
                onChange={(next) => setScoring('speedBonusPoints', next)}
                min={0}
                max={10000}
                step={10}
                suffix="pts"
              />
            </Field>

            <Field label="Wrong answer" hint="Usually zero. Negative is allowed.">
              <Stepper
                value={value.scoringConfig.wrongAnswerPoints}
                onChange={(next) => setScoring('wrongAnswerPoints', next)}
                min={-10000}
                max={10000}
                step={10}
                suffix="pts"
              />
            </Field>

            <Field label="Streak bonus per step">
              <Stepper
                value={value.scoringConfig.streakBonusPoints}
                onChange={(next) => setScoring('streakBonusPoints', next)}
                min={0}
                max={1000}
                step={5}
                suffix="pts"
              />
            </Field>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Switch
              checked={value.scoringConfig.speedBonusEnabled}
              onChange={(next) => setScoring('speedBonusEnabled', next)}
              label="Speed bonus"
              description="Faster correct answers earn more"
              disabled={disabled}
            />
            <Switch
              checked={value.scoringConfig.streakBonusEnabled}
              onChange={(next) => setScoring('streakBonusEnabled', next)}
              label="Streak bonus"
              description="Consecutive correct answers stack"
              disabled={disabled}
            />
          </div>

          {/* Live preview of the curve the host just configured. */}
          <div className="rounded-md border border-rail bg-pit p-4">
            <Kicker className="mb-3">A correct answer is worth</Kicker>
            <div className="flex items-end gap-2">
              {preview.map((point) => {
                const max = Math.max(...preview.map((row) => row.points), 1);
                return (
                  <div key={point.responseSeconds} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className="font-data text-[11px] font-extrabold text-chalk tnum">
                      {point.points}
                    </span>
                    <div
                      className="w-full rounded-t-xs bg-volt transition-[height]"
                      style={{ height: `${Math.max(6, (point.points / max) * 64)}px` }}
                    />
                    <span className="font-data text-[9px] uppercase tracking-[0.08em] text-ghost tnum">
                      {point.responseSeconds.toFixed(0)}s
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <Field label="Tie-break order" hint="Applied top to bottom when points are level.">
            <div className="space-y-2">
              {value.tieBreakers.map((key, index) => (
                <div
                  key={key}
                  className="flex items-center gap-3 rounded-sm border border-rail bg-deck px-3 py-2"
                >
                  <span className="font-data text-[12px] font-extrabold text-volt tnum">
                    {index + 1}
                  </span>
                  <span className="flex-1 text-[14px] text-chalk">{TIE_LABELS[key]}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      aria-label="Move up"
                      disabled={disabled || index === 0}
                      onClick={() => {
                        const next = [...value.tieBreakers];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        set('tieBreakers', next);
                      }}
                      className="grid h-8 w-8 place-items-center rounded-xs text-ghost hover:bg-ridge hover:text-chalk disabled:opacity-25"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      disabled={disabled || index === value.tieBreakers.length - 1}
                      onClick={() => {
                        const next = [...value.tieBreakers];
                        [next[index], next[index + 1]] = [next[index + 1], next[index]];
                        set('tieBreakers', next);
                      }}
                      className="grid h-8 w-8 place-items-center rounded-xs text-ghost hover:bg-ridge hover:text-chalk disabled:opacity-25"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Field>
        </div>
      </section>

      {/* ---- access ------------------------------------------------ */}
      <section>
        <RuleLabel className="mb-5">Access and pace</RuleLabel>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Max players" required error={errors?.maxParticipants}>
              <Stepper
                value={value.maxParticipants}
                onChange={(next) => set('maxParticipants', next)}
                min={1}
                max={100000}
                step={10}
              />
            </Field>
            <Field label="Default seconds" required>
              <Stepper
                value={value.defaultTimeLimitSeconds}
                onChange={(next) => set('defaultTimeLimitSeconds', next)}
                min={5}
                max={600}
                step={5}
                suffix="s"
              />
            </Field>
            <Field label="Default points" required>
              <Stepper
                value={value.defaultBasePoints}
                onChange={(next) => set('defaultBasePoints', next)}
                min={0}
                max={10000}
                step={10}
              />
            </Field>
          </div>

          <Field label="Planned start" hint="Informational. You still press start yourself.">
            <Input
              type="datetime-local"
              value={value.startAt}
              onChange={(event) => set('startAt', event.target.value)}
              disabled={disabled}
            />
          </Field>

          <div className="grid gap-2 sm:grid-cols-2">
            <Switch
              checked={value.joinByCodeEnabled}
              onChange={(next) => set('joinByCodeEnabled', next)}
              label="Join with a code"
              description="Players enter using the tournament code"
              disabled={disabled}
            />
            <Switch
              checked={value.requireApproval}
              onChange={(next) => set('requireApproval', next)}
              label="Approve every entry"
              description="New players wait for you"
              disabled={disabled}
            />
            <Switch
              checked={value.allowLateJoin}
              onChange={(next) => set('allowLateJoin', next)}
              label="Allow late entry"
              description="People can still join after round one"
              disabled={disabled}
            />
            <Switch
              checked={value.showLeaderboardAfterQuestion}
              onChange={(next) => set('showLeaderboardAfterQuestion', next)}
              label="Rankings between rounds"
              description="Show standings the moment a round closes"
              disabled={disabled}
            />
            <Switch
              checked={value.showAnswersToParticipants}
              onChange={(next) => set('showAnswersToParticipants', next)}
              label="Reveal correct answers"
              description="Players see the right answer after each round"
              disabled={disabled}
            />
          </div>
        </div>
      </section>

      <div className={cn('sticky bottom-0 -mx-gutter border-t border-rail bg-ink/95 px-gutter py-4 backdrop-blur-md')}>
        <div className="flex items-center gap-3">
          <Button type="submit" size="xl" className="flex-1" loading={saving} disabled={disabled}>
            {submitLabel}
          </Button>
          {value.name ? <Tag tone="volt">{value.name}</Tag> : null}
        </div>
        {errors?.form ? <p className="mt-2 text-[13px] text-loss">{errors.form}</p> : null}
      </div>
    </form>
  );
}
