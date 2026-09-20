import { describe, expect, it } from 'vitest';
import type { TournamentStatus } from '@prisma/client';
import {
  ALLOWED_TRANSITIONS,
  assertTransition,
  canTransition,
} from '@/lib/services/tournament-service';

const ALL: TournamentStatus[] = [
  'DRAFT',
  'REGISTRATION_OPEN',
  'WAITING',
  'LIVE',
  'PAUSED',
  'FINISHED',
  'ARCHIVED',
];

describe('tournament state machine', () => {
  it('walks the happy path from draft to archive', () => {
    expect(canTransition('DRAFT', 'REGISTRATION_OPEN')).toBe(true);
    expect(canTransition('REGISTRATION_OPEN', 'WAITING')).toBe(true);
    expect(canTransition('WAITING', 'LIVE')).toBe(true);
    expect(canTransition('LIVE', 'PAUSED')).toBe(true);
    expect(canTransition('PAUSED', 'LIVE')).toBe(true);
    expect(canTransition('LIVE', 'FINISHED')).toBe(true);
    expect(canTransition('FINISHED', 'ARCHIVED')).toBe(true);
  });

  it('allows starting straight from registration, skipping the lobby', () => {
    expect(canTransition('REGISTRATION_OPEN', 'LIVE')).toBe(true);
  });

  it('refuses to start a tournament that is still a draft', () => {
    expect(canTransition('DRAFT', 'LIVE')).toBe(false);
    expect(() => assertTransition('DRAFT', 'LIVE')).toThrowError(/cannot move to LIVE/);
  });

  it('refuses to reopen or restart a finished tournament', () => {
    expect(canTransition('FINISHED', 'LIVE')).toBe(false);
    expect(canTransition('FINISHED', 'REGISTRATION_OPEN')).toBe(false);
    expect(canTransition('FINISHED', 'PAUSED')).toBe(false);
  });

  it('treats archived as terminal', () => {
    expect(ALLOWED_TRANSITIONS.ARCHIVED).toEqual([]);
    for (const status of ALL) {
      expect(canTransition('ARCHIVED', status)).toBe(false);
    }
  });

  it('never allows a tournament to move to itself', () => {
    for (const status of ALL) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it('does not allow editing states to be reached from a running tournament', () => {
    expect(canTransition('LIVE', 'DRAFT')).toBe(false);
    expect(canTransition('LIVE', 'REGISTRATION_OPEN')).toBe(false);
    expect(canTransition('PAUSED', 'WAITING')).toBe(false);
  });

  it('can only pause something that is live', () => {
    for (const status of ALL) {
      expect(canTransition(status, 'PAUSED')).toBe(status === 'LIVE');
    }
  });

  it('can only finish from live or paused', () => {
    for (const status of ALL) {
      expect(canTransition(status, 'FINISHED')).toBe(status === 'LIVE' || status === 'PAUSED');
    }
  });

  it('reports a readable error naming both states', () => {
    expect(() => assertTransition('FINISHED', 'LIVE')).toThrowError(
      'A FINISHED tournament cannot move to LIVE.',
    );
  });

  it('declares a transition table entry for every status', () => {
    for (const status of ALL) {
      expect(Array.isArray(ALLOWED_TRANSITIONS[status])).toBe(true);
    }
  });
});
