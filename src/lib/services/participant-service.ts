import type { TournamentParticipant } from '@prisma/client';
import { prisma, lockTournamentRow } from '../db';
import { ApiError } from '../http';
import { normaliseCode } from '../utils';
import { TOURNAMENT_EVENT } from '../realtime/events';
import { emitToHost, emitToTournament, emitToUser } from '../realtime/server';
import { isUserConnected, connectedParticipantCount } from '../realtime/presence';
import { logTournamentEvent } from './event-log-service';
import { invalidateLeaderboard } from './leaderboard-service';
import { NOTIFICATION_TYPE, notifyUser } from './notification-service';
import type { WaitingRoomParticipantDTO } from '@/types';

/** Statuses in which a player is still allowed to enter a tournament. */
const JOINABLE_STATUSES = new Set(['REGISTRATION_OPEN', 'WAITING', 'LIVE', 'PAUSED']);

export interface JoinResult {
  participant: TournamentParticipant;
  tournamentId: string;
  alreadyJoined: boolean;
  pendingApproval: boolean;
}

/**
 * Joining is capacity-checked inside a transaction that holds the tournament
 * row, so a burst of players cannot push a tournament past its limit.
 */
export async function joinTournament(
  userId: string,
  input: { code?: string; tournamentId?: string },
): Promise<JoinResult> {
  const tournament = input.tournamentId
    ? await prisma.tournament.findUnique({ where: { id: input.tournamentId } })
    : input.code
      ? await prisma.tournament.findUnique({ where: { code: normaliseCode(input.code) } })
      : null;

  if (!tournament) throw ApiError.notFound('No tournament matches that code.');

  if (input.code && !tournament.joinByCodeEnabled) {
    throw ApiError.forbidden('This tournament is not open for code entry.');
  }

  if (!JOINABLE_STATUSES.has(tournament.status)) {
    throw ApiError.invalidState(
      tournament.status === 'DRAFT'
        ? 'This tournament has not opened yet.'
        : 'This tournament is no longer accepting players.',
    );
  }

  if (['LIVE', 'PAUSED'].includes(tournament.status) && !tournament.allowLateJoin) {
    throw ApiError.invalidState('This tournament has already started.');
  }

  const result = await prisma.$transaction(async (tx) => {
    await lockTournamentRow(tx, tournament.id);

    const existing = await tx.tournamentParticipant.findUnique({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId } },
    });

    if (existing) {
      if (existing.status === 'DISQUALIFIED') {
        throw ApiError.forbidden('You have been removed from this tournament.');
      }
      return {
        participant: existing,
        tournamentId: tournament.id,
        alreadyJoined: true,
        pendingApproval: existing.status === 'PENDING',
      };
    }

    const current = await tx.tournamentParticipant.count({
      where: { tournamentId: tournament.id, status: { not: 'DISQUALIFIED' } },
    });

    if (current >= tournament.maxParticipants) {
      throw ApiError.conflict('This tournament is full.');
    }

    const participant = await tx.tournamentParticipant.create({
      data: {
        tournamentId: tournament.id,
        userId,
        status: tournament.requireApproval ? 'PENDING' : 'ACTIVE',
        approvedAt: tournament.requireApproval ? null : new Date(),
      },
    });

    await logTournamentEvent(
      {
        tournamentId: tournament.id,
        type: TOURNAMENT_EVENT.PARTICIPANT_JOINED,
        actorId: userId,
        payload: { participantId: participant.id, requiresApproval: tournament.requireApproval },
      },
      tx,
    );

    return {
      participant,
      tournamentId: tournament.id,
      alreadyJoined: false,
      pendingApproval: tournament.requireApproval,
    };
  });

  if (!result.alreadyJoined) {
    await invalidateLeaderboard(tournament.id);
    await broadcastParticipantChange(tournament.id, result.participant.id, 'tournament:joined');

    await notifyUser(tournament.hostId, {
      type: NOTIFICATION_TYPE.TOURNAMENT_STARTING,
      title: 'New player joined',
      body: `Someone just entered ${tournament.name}.`,
      data: { tournamentId: tournament.id },
    });
  }

  return result;
}

async function broadcastParticipantChange(
  tournamentId: string,
  participantId: string,
  event: 'tournament:joined' | 'tournament:participantUpdated',
): Promise<void> {
  const row = await prisma.tournamentParticipant.findUnique({
    where: { id: participantId },
    include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
  });
  if (!row) return;

  const participantCount = await prisma.tournamentParticipant.count({
    where: { tournamentId, status: 'ACTIVE' },
  });

  const payload = {
    tournamentId,
    participant: {
      participantId: row.id,
      id: row.user.id,
      username: row.user.username,
      displayName: row.user.displayName,
      avatarUrl: row.user.avatarUrl,
      joinedAt: row.joinedAt.toISOString(),
      status: row.status,
      connected: isUserConnected(tournamentId, row.userId),
    } satisfies WaitingRoomParticipantDTO,
    participantCount,
  };

  emitToTournament(tournamentId, event, payload);
  emitToTournament(tournamentId, 'presence:update', {
    tournamentId,
    connectedCount: connectedParticipantCount(tournamentId),
    participantCount,
  });
}

export async function listParticipants(tournamentId: string) {
  const rows = await prisma.tournamentParticipant.findMany({
    where: { tournamentId },
    include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, email: true } } },
    orderBy: [{ totalPoints: 'desc' }, { joinedAt: 'asc' }],
  });

  return rows.map((row) => ({
    participantId: row.id,
    userId: row.userId,
    username: row.user.username,
    displayName: row.user.displayName,
    avatarUrl: row.user.avatarUrl,
    email: row.user.email,
    status: row.status,
    joinedAt: row.joinedAt.toISOString(),
    connected: isUserConnected(tournamentId, row.userId),
    totalPoints: row.totalPoints,
    correctCount: row.correctCount,
    wrongCount: row.wrongCount,
    answeredCount: row.answeredCount,
    rank: row.rank,
    finalRank: row.finalRank,
    currentStreak: row.currentStreak,
    bestStreak: row.bestStreak,
    averageResponseMs: row.answeredCount ? Math.round(row.totalResponseTimeMs / row.answeredCount) : null,
    fastestResponseMs: row.fastestResponseMs,
    disqualifiedReason: row.disqualifiedReason,
  }));
}

export type AdminParticipantDTO = Awaited<ReturnType<typeof listParticipants>>[number];

/** Waiting-room view: public fields only, no email addresses. */
export async function listWaitingRoom(tournamentId: string): Promise<WaitingRoomParticipantDTO[]> {
  const rows = await prisma.tournamentParticipant.findMany({
    where: { tournamentId, status: { in: ['ACTIVE', 'PENDING'] } },
    include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    orderBy: { joinedAt: 'asc' },
    take: 500,
  });

  return rows.map((row) => ({
    participantId: row.id,
    id: row.user.id,
    username: row.user.username,
    displayName: row.user.displayName,
    avatarUrl: row.user.avatarUrl,
    joinedAt: row.joinedAt.toISOString(),
    status: row.status,
    connected: isUserConnected(tournamentId, row.userId),
  }));
}

export async function getParticipation(tournamentId: string, userId: string) {
  return prisma.tournamentParticipant.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
  });
}

export async function approveParticipant(participantId: string, actorId: string) {
  const participant = await prisma.tournamentParticipant.findUnique({ where: { id: participantId } });
  if (!participant) throw ApiError.notFound('Participant not found.');
  if (participant.status !== 'PENDING') {
    throw ApiError.invalidState('That player is not awaiting approval.');
  }

  const updated = await prisma.tournamentParticipant.update({
    where: { id: participantId },
    data: { status: 'ACTIVE', approvedAt: new Date() },
  });

  await logTournamentEvent({
    tournamentId: participant.tournamentId,
    type: TOURNAMENT_EVENT.PARTICIPANT_APPROVED,
    actorId,
    payload: { participantId },
  });

  await invalidateLeaderboard(participant.tournamentId);
  await broadcastParticipantChange(participant.tournamentId, participantId, 'tournament:participantUpdated');
  await notifyUser(participant.userId, {
    type: NOTIFICATION_TYPE.JOIN_APPROVED,
    title: 'You are in',
    body: 'The host approved your entry. Head to the waiting room.',
    data: { tournamentId: participant.tournamentId },
  });

  return updated;
}

export async function disqualifyParticipant(
  participantId: string,
  actorId: string,
  reason: string | null,
) {
  const participant = await prisma.tournamentParticipant.findUnique({ where: { id: participantId } });
  if (!participant) throw ApiError.notFound('Participant not found.');

  const updated = await prisma.tournamentParticipant.update({
    where: { id: participantId },
    data: {
      status: 'DISQUALIFIED',
      disqualifiedAt: new Date(),
      disqualifiedReason: reason,
    },
  });

  await prisma.score.create({
    data: {
      tournamentId: participant.tournamentId,
      userId: participant.userId,
      participantId,
      points: 0,
      reason: 'DISQUALIFICATION',
      note: reason,
    },
  });

  await logTournamentEvent({
    tournamentId: participant.tournamentId,
    type: TOURNAMENT_EVENT.PARTICIPANT_DISQUALIFIED,
    actorId,
    payload: { participantId, reason },
  });

  await invalidateLeaderboard(participant.tournamentId);
  await broadcastParticipantChange(participant.tournamentId, participantId, 'tournament:participantUpdated');
  emitToHost(participant.tournamentId, 'presence:update', {
    tournamentId: participant.tournamentId,
    connectedCount: connectedParticipantCount(participant.tournamentId),
    participantCount: await prisma.tournamentParticipant.count({
      where: { tournamentId: participant.tournamentId, status: 'ACTIVE' },
    }),
  });

  emitToUser(participant.userId, 'server:error', {
    message: reason ? `You were disqualified: ${reason}` : 'You were disqualified from this tournament.',
  });
  await notifyUser(participant.userId, {
    type: NOTIFICATION_TYPE.DISQUALIFIED,
    title: 'Removed from tournament',
    body: reason ?? 'The host removed you from this tournament.',
    data: { tournamentId: participant.tournamentId },
  });

  return updated;
}

export async function reinstateParticipant(participantId: string, actorId: string) {
  const participant = await prisma.tournamentParticipant.findUnique({ where: { id: participantId } });
  if (!participant) throw ApiError.notFound('Participant not found.');
  if (participant.status !== 'DISQUALIFIED') {
    throw ApiError.invalidState('That player is not disqualified.');
  }

  const updated = await prisma.tournamentParticipant.update({
    where: { id: participantId },
    data: { status: 'ACTIVE', disqualifiedAt: null, disqualifiedReason: null },
  });

  await logTournamentEvent({
    tournamentId: participant.tournamentId,
    type: 'PARTICIPANT_REINSTATED',
    actorId,
    payload: { participantId },
  });

  await invalidateLeaderboard(participant.tournamentId);
  await broadcastParticipantChange(participant.tournamentId, participantId, 'tournament:participantUpdated');
  return updated;
}

/** Requires an ACTIVE participant record. Used by the submission pipeline. */
export async function requireActiveParticipant(tournamentId: string, userId: string) {
  const participant = await getParticipation(tournamentId, userId);
  if (!participant) throw ApiError.forbidden('You have not joined this tournament.');
  if (participant.status === 'PENDING') {
    throw ApiError.forbidden('The host has not approved your entry yet.');
  }
  if (participant.status === 'DISQUALIFIED') {
    throw ApiError.forbidden('You have been removed from this tournament.');
  }
  return participant;
}
