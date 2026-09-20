import { z } from 'zod';
import { clamp } from '../utils';
import type { ScoringConfigDTO, SubmissionOutcomeDTO } from '@/types';

/**
 * Scoring is deliberately isolated from storage and transport: it is a pure
 * function of (outcome, timing, question value, config). That keeps it fully
 * unit-testable and lets an admin swap the formula without touching the
 * submission pipeline.
 */

export type ScoringConfig = ScoringConfigDTO;

export const scoringConfigSchema = z.object({
  formula: z
    .enum(['LINEAR_SPEED_BONUS', 'STEPPED_SPEED_BONUS', 'FLAT'])
    .default('LINEAR_SPEED_BONUS'),
  correctPoints: z.number().int().min(0).max(10_000).default(100),
  speedBonusEnabled: z.boolean().default(true),
  speedBonusPoints: z.number().int().min(0).max(10_000).default(50),
  wrongAnswerPoints: z.number().int().min(-10_000).max(10_000).default(0),
  noAnswerPoints: z.number().int().min(-10_000).max(10_000).default(0),
  partialCreditEnabled: z.boolean().default(true),
  streakBonusEnabled: z.boolean().default(true),
  streakBonusPoints: z.number().int().min(0).max(1000).default(10),
  streakBonusCap: z.number().int().min(0).max(5000).default(50),
  minimumSpeedRatio: z.number().min(0).max(1).default(0),
});

export const DEFAULT_SCORING_CONFIG: ScoringConfig = scoringConfigSchema.parse({});

/** Tolerant parse: unknown/legacy JSON falls back to the defaults per field. */
export function parseScoringConfig(raw: unknown): ScoringConfig {
  const result = scoringConfigSchema.safeParse(raw ?? {});
  return result.success ? result.data : DEFAULT_SCORING_CONFIG;
}

/**
 * A speed curve maps "fraction of the time limit still remaining" (0..1) to a
 * fraction of the speed bonus (0..1). New curves can be registered at runtime,
 * which is the extension point for admin-authored scoring rules.
 */
export type SpeedCurve = (remainingRatio: number) => number;

const speedCurves = new Map<string, SpeedCurve>([
  ['LINEAR_SPEED_BONUS', (ratio) => ratio],
  [
    'STEPPED_SPEED_BONUS',
    (ratio) => {
      if (ratio >= 0.75) return 1;
      if (ratio >= 0.5) return 0.66;
      if (ratio >= 0.25) return 0.33;
      return 0;
    },
  ],
  ['FLAT', () => 0],
]);

export function registerSpeedCurve(name: string, curve: SpeedCurve): void {
  speedCurves.set(name, curve);
}

export function getSpeedCurve(name: string): SpeedCurve {
  return speedCurves.get(name) ?? speedCurves.get('LINEAR_SPEED_BONUS')!;
}

export interface ScoreInput {
  outcome: SubmissionOutcomeDTO;
  /** Server-measured response time. Null means the player never answered. */
  responseTimeMs: number | null;
  timeLimitMs: number;
  /** Question-level overrides; fall back to the tournament config. */
  basePoints?: number;
  speedBonusPoints?: number;
  /** Consecutive correct answers immediately before this one. */
  streakBefore?: number;
  /** 0..1, only used when outcome is PARTIAL. */
  partialRatio?: number;
  config: ScoringConfig;
}

export interface ScoreBreakdown {
  basePoints: number;
  speedBonus: number;
  streakBonus: number;
  total: number;
  /** Fraction of the time limit still remaining when the answer landed. */
  speedRatio: number;
}

const EMPTY_BREAKDOWN: ScoreBreakdown = {
  basePoints: 0,
  speedBonus: 0,
  streakBonus: 0,
  total: 0,
  speedRatio: 0,
};

export function computeSpeedRatio(responseTimeMs: number | null, timeLimitMs: number): number {
  if (responseTimeMs === null || timeLimitMs <= 0) return 0;
  return clamp(1 - responseTimeMs / timeLimitMs, 0, 1);
}

/**
 * The single place where points are decided. Callers never compute points
 * themselves, and the client never sends them.
 */
export function calculateScore(input: ScoreInput): ScoreBreakdown {
  const { config, outcome } = input;

  if (outcome === 'NO_ANSWER' || outcome === 'PENDING') {
    return { ...EMPTY_BREAKDOWN, total: outcome === 'NO_ANSWER' ? config.noAnswerPoints : 0 };
  }

  if (outcome === 'INCORRECT') {
    return { ...EMPTY_BREAKDOWN, total: config.wrongAnswerPoints };
  }

  const questionBase = input.basePoints ?? config.correctPoints;
  const questionSpeedBonus = input.speedBonusPoints ?? config.speedBonusPoints;
  const rawRatio = computeSpeedRatio(input.responseTimeMs, input.timeLimitMs);
  const speedRatio = Math.max(rawRatio, config.minimumSpeedRatio);

  const creditRatio =
    outcome === 'PARTIAL' && config.partialCreditEnabled ? clamp(input.partialRatio ?? 0.5, 0, 1) : 1;

  const basePoints = Math.round(questionBase * creditRatio);

  const curve = getSpeedCurve(config.formula);
  const speedBonus = config.speedBonusEnabled
    ? Math.round(questionSpeedBonus * curve(speedRatio) * creditRatio)
    : 0;

  const streakBefore = Math.max(0, input.streakBefore ?? 0);
  const streakBonus =
    config.streakBonusEnabled && outcome === 'CORRECT'
      ? Math.min(config.streakBonusCap, config.streakBonusPoints * streakBefore)
      : 0;

  const total = Math.max(0, basePoints + speedBonus + streakBonus);

  return { basePoints, speedBonus, streakBonus, total, speedRatio };
}

/**
 * Preview helper used by the admin scoring editor: what would a correct answer
 * be worth at several points across the question window?
 */
export function previewScoreCurve(config: ScoringConfig, timeLimitSeconds: number, basePoints: number) {
  const timeLimitMs = timeLimitSeconds * 1000;
  return [0.1, 0.25, 0.5, 0.75, 0.95].map((fraction) => {
    const responseTimeMs = Math.round(timeLimitMs * fraction);
    const breakdown = calculateScore({
      outcome: 'CORRECT',
      responseTimeMs,
      timeLimitMs,
      basePoints,
      config,
      streakBefore: 0,
    });
    return { responseSeconds: responseTimeMs / 1000, points: breakdown.total };
  });
}
