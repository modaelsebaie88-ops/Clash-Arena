import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCORING_CONFIG,
  calculateScore,
  computeSpeedRatio,
  getSpeedCurve,
  parseScoringConfig,
  previewScoreCurve,
  registerSpeedCurve,
  type ScoringConfig,
} from '@/lib/services/scoring-service';

const TIME_LIMIT = 30_000;

function config(overrides: Partial<ScoringConfig> = {}): ScoringConfig {
  return { ...DEFAULT_SCORING_CONFIG, ...overrides };
}

describe('computeSpeedRatio', () => {
  it('is 1 for an instant answer and 0 at the deadline', () => {
    expect(computeSpeedRatio(0, TIME_LIMIT)).toBe(1);
    expect(computeSpeedRatio(TIME_LIMIT, TIME_LIMIT)).toBe(0);
  });

  it('is linear in between', () => {
    expect(computeSpeedRatio(TIME_LIMIT / 2, TIME_LIMIT)).toBeCloseTo(0.5);
  });

  it('never goes negative when an answer somehow overshoots', () => {
    expect(computeSpeedRatio(TIME_LIMIT * 2, TIME_LIMIT)).toBe(0);
  });

  it('is 0 when there is no answer or no clock', () => {
    expect(computeSpeedRatio(null, TIME_LIMIT)).toBe(0);
    expect(computeSpeedRatio(1000, 0)).toBe(0);
  });
});

describe('calculateScore', () => {
  it('awards base points plus a speed bonus for a fast correct answer', () => {
    const result = calculateScore({
      outcome: 'CORRECT',
      responseTimeMs: 3_000,
      timeLimitMs: TIME_LIMIT,
      basePoints: 100,
      speedBonusPoints: 50,
      config: config(),
    });

    // 90% of the window remained, so 90% of the 50-point bonus.
    expect(result.basePoints).toBe(100);
    expect(result.speedBonus).toBe(45);
    expect(result.total).toBe(145);
  });

  it('gives a slower correct answer fewer points than a faster one', () => {
    const fast = calculateScore({
      outcome: 'CORRECT',
      responseTimeMs: 3_000,
      timeLimitMs: TIME_LIMIT,
      basePoints: 100,
      speedBonusPoints: 50,
      config: config(),
    });
    const medium = calculateScore({
      outcome: 'CORRECT',
      responseTimeMs: 8_000,
      timeLimitMs: TIME_LIMIT,
      basePoints: 100,
      speedBonusPoints: 50,
      config: config(),
    });
    const slow = calculateScore({
      outcome: 'CORRECT',
      responseTimeMs: 21_000,
      timeLimitMs: TIME_LIMIT,
      basePoints: 100,
      speedBonusPoints: 50,
      config: config(),
    });

    expect(fast.total).toBeGreaterThan(medium.total);
    expect(medium.total).toBeGreaterThan(slow.total);
    // Even the slowest correct answer still beats a wrong one.
    expect(slow.total).toBeGreaterThan(0);
  });

  it('scores a wrong answer as zero by default', () => {
    const result = calculateScore({
      outcome: 'INCORRECT',
      responseTimeMs: 1_000,
      timeLimitMs: TIME_LIMIT,
      config: config(),
    });
    expect(result.total).toBe(0);
    expect(result.speedBonus).toBe(0);
  });

  it('scores no answer as zero and ignores speed entirely', () => {
    const result = calculateScore({
      outcome: 'NO_ANSWER',
      responseTimeMs: null,
      timeLimitMs: TIME_LIMIT,
      config: config(),
    });
    expect(result.total).toBe(0);
    expect(result.basePoints).toBe(0);
  });

  it('honours a configured penalty for wrong answers', () => {
    const result = calculateScore({
      outcome: 'INCORRECT',
      responseTimeMs: 1_000,
      timeLimitMs: TIME_LIMIT,
      config: config({ wrongAnswerPoints: -25 }),
    });
    expect(result.total).toBe(-25);
  });

  it('drops the speed bonus when it is switched off', () => {
    const result = calculateScore({
      outcome: 'CORRECT',
      responseTimeMs: 100,
      timeLimitMs: TIME_LIMIT,
      basePoints: 100,
      speedBonusPoints: 50,
      config: config({ speedBonusEnabled: false }),
    });
    expect(result.speedBonus).toBe(0);
    expect(result.total).toBe(100);
  });

  it('adds a streak bonus that is capped', () => {
    const third = calculateScore({
      outcome: 'CORRECT',
      responseTimeMs: TIME_LIMIT,
      timeLimitMs: TIME_LIMIT,
      basePoints: 100,
      speedBonusPoints: 0,
      streakBefore: 3,
      config: config({ streakBonusPoints: 10, streakBonusCap: 50 }),
    });
    expect(third.streakBonus).toBe(30);

    const runaway = calculateScore({
      outcome: 'CORRECT',
      responseTimeMs: TIME_LIMIT,
      timeLimitMs: TIME_LIMIT,
      basePoints: 100,
      speedBonusPoints: 0,
      streakBefore: 40,
      config: config({ streakBonusPoints: 10, streakBonusCap: 50 }),
    });
    expect(runaway.streakBonus).toBe(50);
  });

  it('never applies a streak bonus to a wrong answer', () => {
    const result = calculateScore({
      outcome: 'INCORRECT',
      responseTimeMs: 1_000,
      timeLimitMs: TIME_LIMIT,
      streakBefore: 9,
      config: config(),
    });
    expect(result.streakBonus).toBe(0);
  });

  it('scales partial credit by the awarded ratio', () => {
    const result = calculateScore({
      outcome: 'PARTIAL',
      responseTimeMs: 0,
      timeLimitMs: TIME_LIMIT,
      basePoints: 100,
      speedBonusPoints: 50,
      partialRatio: 0.5,
      config: config(),
    });
    expect(result.basePoints).toBe(50);
    expect(result.total).toBeLessThan(150);
    expect(result.total).toBeGreaterThan(0);
  });

  it('treats partial credit as full when partial credit is disabled', () => {
    const result = calculateScore({
      outcome: 'PARTIAL',
      responseTimeMs: 0,
      timeLimitMs: TIME_LIMIT,
      basePoints: 100,
      speedBonusPoints: 0,
      partialRatio: 0.5,
      config: config({ partialCreditEnabled: false }),
    });
    expect(result.basePoints).toBe(100);
  });

  it('respects a minimum speed ratio floor', () => {
    const result = calculateScore({
      outcome: 'CORRECT',
      responseTimeMs: TIME_LIMIT,
      timeLimitMs: TIME_LIMIT,
      basePoints: 100,
      speedBonusPoints: 50,
      config: config({ minimumSpeedRatio: 0.2 }),
    });
    expect(result.speedBonus).toBe(10);
  });

  it('prefers the question overrides over the tournament defaults', () => {
    const result = calculateScore({
      outcome: 'CORRECT',
      responseTimeMs: 0,
      timeLimitMs: TIME_LIMIT,
      basePoints: 250,
      speedBonusPoints: 10,
      config: config({ correctPoints: 100, speedBonusPoints: 50 }),
    });
    expect(result.basePoints).toBe(250);
    expect(result.speedBonus).toBe(10);
  });

  it('never returns a negative total for a correct answer', () => {
    const result = calculateScore({
      outcome: 'CORRECT',
      responseTimeMs: 0,
      timeLimitMs: TIME_LIMIT,
      basePoints: 0,
      speedBonusPoints: 0,
      config: config(),
    });
    expect(result.total).toBe(0);
  });
});

describe('scoring formulas', () => {
  it('flat scoring ignores speed completely', () => {
    const fast = calculateScore({
      outcome: 'CORRECT',
      responseTimeMs: 100,
      timeLimitMs: TIME_LIMIT,
      basePoints: 100,
      speedBonusPoints: 50,
      config: config({ formula: 'FLAT' }),
    });
    const slow = calculateScore({
      outcome: 'CORRECT',
      responseTimeMs: 29_000,
      timeLimitMs: TIME_LIMIT,
      basePoints: 100,
      speedBonusPoints: 50,
      config: config({ formula: 'FLAT' }),
    });
    expect(fast.total).toBe(slow.total);
  });

  it('stepped scoring puts answers into brackets', () => {
    const inTopBracket = calculateScore({
      outcome: 'CORRECT',
      responseTimeMs: 3_000,
      timeLimitMs: TIME_LIMIT,
      basePoints: 100,
      speedBonusPoints: 60,
      config: config({ formula: 'STEPPED_SPEED_BONUS' }),
    });
    const alsoTopBracket = calculateScore({
      outcome: 'CORRECT',
      responseTimeMs: 6_000,
      timeLimitMs: TIME_LIMIT,
      basePoints: 100,
      speedBonusPoints: 60,
      config: config({ formula: 'STEPPED_SPEED_BONUS' }),
    });
    const lowerBracket = calculateScore({
      outcome: 'CORRECT',
      responseTimeMs: 20_000,
      timeLimitMs: TIME_LIMIT,
      basePoints: 100,
      speedBonusPoints: 60,
      config: config({ formula: 'STEPPED_SPEED_BONUS' }),
    });

    expect(inTopBracket.total).toBe(alsoTopBracket.total);
    expect(inTopBracket.total).toBeGreaterThan(lowerBracket.total);
  });

  it('accepts a new curve registered at runtime', () => {
    registerSpeedCurve('TEST_ALL_OR_NOTHING', (ratio) => (ratio > 0.9 ? 1 : 0));

    const curve = getSpeedCurve('TEST_ALL_OR_NOTHING');
    expect(curve(0.95)).toBe(1);
    expect(curve(0.5)).toBe(0);
  });

  it('falls back to the linear curve for an unknown formula name', () => {
    const curve = getSpeedCurve('NOT_A_REAL_FORMULA');
    expect(curve(0.4)).toBeCloseTo(0.4);
  });
});

describe('parseScoringConfig', () => {
  it('fills in defaults for missing fields', () => {
    const parsed = parseScoringConfig({ correctPoints: 250 });
    expect(parsed.correctPoints).toBe(250);
    expect(parsed.speedBonusPoints).toBe(DEFAULT_SCORING_CONFIG.speedBonusPoints);
  });

  it('falls back to the full defaults for unusable input', () => {
    expect(parseScoringConfig(null)).toEqual(DEFAULT_SCORING_CONFIG);
    expect(parseScoringConfig('nonsense')).toEqual(DEFAULT_SCORING_CONFIG);
    expect(parseScoringConfig({ correctPoints: -5 })).toEqual(DEFAULT_SCORING_CONFIG);
  });
});

describe('previewScoreCurve', () => {
  it('produces a descending curve of points across the window', () => {
    const preview = previewScoreCurve(config(), 30, 100);
    const points = preview.map((entry) => entry.points);

    expect(points).toHaveLength(5);
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i]).toBeLessThanOrEqual(points[i - 1]);
    }
  });
});
