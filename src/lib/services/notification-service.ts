import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { emitToUser } from '../realtime/server';
import type { NotificationDTO } from '@/types';

export const NOTIFICATION_TYPE = {
  TOURNAMENT_STARTING: 'TOURNAMENT_STARTING',
  TOURNAMENT_STARTED: 'TOURNAMENT_STARTED',
  QUESTION_STARTED: 'QUESTION_STARTED',
  RANK_UP: 'RANK_UP',
  BADGE_EARNED: 'BADGE_EARNED',
  TOURNAMENT_FINISHED: 'TOURNAMENT_FINISHED',
  SUBMISSION_GRADED: 'SUBMISSION_GRADED',
  JOIN_APPROVED: 'JOIN_APPROVED',
  DISQUALIFIED: 'DISQUALIFIED',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

export interface NotificationInput {
  type: NotificationType | string;
  title: string;
  body?: string | null;
  data?: Record<string, unknown> | null;
}

function toDTO(row: {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Prisma.JsonValue;
  readAt: Date | null;
  createdAt: Date;
}): NotificationDTO {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    data: (row.data as Record<string, unknown> | null) ?? null,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Persist + push over the websocket so the bell updates without a refresh. */
export async function notifyUser(userId: string, input: NotificationInput): Promise<NotificationDTO> {
  const row = await prisma.notification.create({
    data: {
      userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });

  const dto = toDTO(row);
  emitToUser(userId, 'notification:new', dto);
  return dto;
}

/**
 * Fan-out helper. One insert statement for the whole audience, then a push per
 * connected user - so a 1000-player tournament costs one database round trip.
 */
export async function notifyUsers(userIds: string[], input: NotificationInput): Promise<void> {
  if (!userIds.length) return;

  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
    })),
  });

  const createdAt = new Date().toISOString();
  for (const userId of userIds) {
    emitToUser(userId, 'notification:new', {
      id: `bulk-${createdAt}-${userId}`,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      data: (input.data as Record<string, unknown> | null) ?? null,
      readAt: null,
      createdAt,
    });
  }
}

export async function listNotifications(
  userId: string,
  options: { limit?: number; unreadOnly?: boolean } = {},
): Promise<NotificationDTO[]> {
  const rows = await prisma.notification.findMany({
    where: { userId, ...(options.unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(options.limit ?? 30, 100),
  });
  return rows.map(toDTO);
}

export async function countUnread(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markNotificationsRead(userId: string, ids?: string[]): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  return result.count;
}
