import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIE_BREAKERS,
  compareParticipants,
  parseTieBreakers,
  rankParticipants,
  type RankableParticipant,
} from '@/lib/services/leaderboard-service';

let counter = 0;

function player(overrides: Partial<RankableParticipant> = {}): RankableParticipant {
  counter += 1;
  return {
    participantId: `p${counter}`,
    userId: `u${counter}`,
    username: `player${counter}`,
    displayName: `Player ${counter}`,
    avatarUrl: null,
    status: 'ACTIVE',
    totalPoints: 0,
    answeredCount: 0,
    correctCount: 0,
    wrongCount: 0,
    totalResponseTimeMs: 0,
    fastestResponseMs: null,
    currentStreak: 0,
    bestStreak: 0,
    bestRank: null,
    previousRank: null,
    lastSubmissionAt: null,
    ...overrides,
  };
}

describe('compareParticipants', () => {
  it('puts the higher score first', () => {
    const a = player({ totalPoints: 900 });
    const b = player({ totalPoints: 800 });
    expect(compareParticipants(a, b)).toBeLessThan(0);
    expect(compareParticipants(b, a)).toBeGreaterThan(0);
  });

  it('breaks a points tie on the number of correct answers', () => {
    const a = player({ totalPoints: 800, correctCount: 8 });
    const b = player({ totalPoints: 800, correctCount: 7 });
    expect(compareParticipants(a, b)).toBeLessThan(0);
  });

  it('breaks a points and accuracy tie on total response time', () => {
    const quick = player({ totalPoints: 800, correctCount: 8, totalResponseTimeMs: 20_000 });
    const slow = player({ totalPoints: 800, correctCount: 8, totalResponseTimeMs: 40_000 });
    expect(compareParticipants(quick, slow)).toBeLessThan(0);
  });

  it('falls through to the earliest final submission', () => {
    const early = player({
      totalPoints: 800,
      correctCount: 8,
      totalResponseTimeMs: 20_000,
      lastSubmissionAt: new Date('2026-01-01T10:00:00Z'),
    });
    const late = player({
      totalPoints: 800,
      correctCount: 8,
      totalResponseTimeMs: 20_000,
      lastSubmissionAt: new Date('2026-01-01T10:05:00Z'),
    });
    expect(compareParticipants(early, late)).toBeLessThan(0);
  });

  it('sinks a disqualified player below everyone, however many points they hold', () => {
    const cheat = player({ totalPoints: 5_000, status: 'DISQUALIFIED' });
    const honest = player({ totalPoints: 10 });
    expect(compareParticipants(cheat, honest)).toBeGreaterThan(0);
  });

  it('is deterministic when every tie-break is equal', () => {
    const a = player({ participantId: 'aaa', totalPoints: 100 });
    const b = player({ participantId: 'bbb', totalPoints: 100 });
    expect(compareParticipants(a, b)).toBeLessThan(0);
    expect(compareParticipants(b, a)).toBeGreaterThan(0);
  });

  it('respects a custom tie-break order', () => {
    const streaky = player({ totalPoints: 500, bestStreak: 9, totalResponseTimeMs: 90_000 });
    const fast = player({ totalPoints: 500, bestStreak: 2, totalResponseTimeMs: 10_000 });

    expect(compareParticipants(streaky, fast, ['TOTAL_POINTS', 'BEST_STREAK'])).toBeLessThan(0);
    expect(compareParticipants(streaky, fast, ['TOTAL_POINTS', 'TOTAL_RESPONSE_TIME'])).toBeGreaterThan(0);
  });
});

describe('rankParticipants', () => {
  it('orders players and numbers them from one', () => {
    const entries = rankParticipants([
      player({ displayName: 'Third', totalPoints: 700 }),
      player({ displayName: 'First', totalPoints: 900 }),
      player({ displayName: 'Second', totalPoints: 800 }),
    ]);

    expect(entries.map((entry) => entry.displayName)).toEqual(['First', 'Second', 'Third']);
    expect(entries.map((entry) => entry.rank)).toEqual([1, 2, 3]);
  });

  it('shares a rank for a genuine tie and skips the next rank', () => {
    const shared = {
      totalPoints: 800,
      correctCount: 8,
      totalResponseTimeMs: 20_000,
      lastSubmissionAt: new Date('2026-01-01T10:00:00Z'),
    };

    const entries = rankParticipants([
      player({ displayName: 'Leader', totalPoints: 900 }),
      player({ displayName: 'TieA', ...shared }),
      player({ displayName: 'TieB', ...shared }),
      player({ displayName: 'Last', totalPoints: 100 }),
    ]);

    expect(entries.map((entry) => entry.rank)).toEqual([1, 2, 2, 4]);
  });

  it('computes rank movement from the previous rank', () => {
    const entries = rankParticipants([
      player({ displayName: 'Climber', totalPoints: 900, previousRank: 8 }),
      player({ displayName: 'Faller', totalPoints: 500, previousRank: 1 }),
      player({ displayName: 'Newcomer', totalPoints: 300, previousRank: null }),
    ]);

    expect(entries[0].rankDelta).toBe(7);
    expect(entries[1].rankDelta).toBe(-1);
    expect(entries[2].rankDelta).toBeNull();
  });

  it('reports the average response time over answered questions only', () => {
    const [entry] = rankParticipants([
      player({ answeredCount: 4, totalResponseTimeMs: 20_000 }),
    ]);
    expect(entry.averageResponseMs).toBe(5_000);
  });

  it('leaves the average empty for a player who never answered', () => {
    const [entry] = rankParticipants([player({ answeredCount: 0, totalResponseTimeMs: 0 })]);
    expect(entry.averageResponseMs).toBeNull();
  });

  it('handles an empty field', () => {
    expect(rankParticipants([])).toEqual([]);
  });

  it('keeps disqualified players on the board but at the bottom', () => {
    const entries = rankParticipants([
      player({ displayName: 'Cheat', totalPoints: 9_999, status: 'DISQUALIFIED' }),
      player({ displayName: 'Honest', totalPoints: 10 }),
    ]);

    expect(entries[0].displayName).toBe('Honest');
    expect(entries[1].displayName).toBe('Cheat');
    expect(entries[1].rank).toBe(2);
  });
});

describe('parseTieBreakers', () => {
  it('returns the defaults for unusable input', () => {
    expect(parseTieBreakers(null)).toEqual(DEFAULT_TIE_BREAKERS);
    expect(parseTieBreakers([])).toEqual(DEFAULT_TIE_BREAKERS);
    expect(parseTieBreakers(['NOT_A_KEY'])).toEqual(DEFAULT_TIE_BREAKERS);
  });

  it('keeps only recognised keys, in the order given', () => {
    expect(parseTieBreakers(['BEST_STREAK', 'bogus', 'TOTAL_POINTS'])).toEqual([
      'BEST_STREAK',
      'TOTAL_POINTS',
    ]);
  });
});
