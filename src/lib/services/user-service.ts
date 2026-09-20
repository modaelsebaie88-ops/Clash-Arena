import { z } from 'zod';
import { prisma } from '../db';
import { ApiError } from '../http';
import { hashPassword, verifyPassword } from '../auth/session';
import { listUserBadges } from './badge-service';
import type { SessionUserDTO } from '@/types';

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Username must be at least 3 characters')
    .max(24)
    .regex(/^[a-z0-9_.-]+$/, 'Use letters, numbers, dots, dashes or underscores'),
  displayName: z.string().trim().min(2, 'Display name is required').max(60),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(200)
    .regex(/[a-zA-Z]/, 'Include at least one letter')
    .regex(/[0-9]/, 'Include at least one number'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(60),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(24)
    .regex(/^[a-z0-9_.-]+$/, 'Use letters, numbers, dots, dashes or underscores'),
  bio: z.string().max(500).nullish(),
  avatarUrl: z.string().max(1000).nullish(),
});

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(200)
      .regex(/[a-zA-Z]/, 'Include at least one letter')
      .regex(/[0-9]/, 'Include at least one number'),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'Choose a password you have not used here before',
    path: ['newPassword'],
  });

export function toSessionUserDTO(user: {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  role: string;
  totalTournaments: number;
  totalWins: number;
  totalPoints: number;
  createdAt: Date;
}): SessionUserDTO {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    role: user.role as SessionUserDTO['role'],
    totalTournaments: user.totalTournaments,
    totalWins: user.totalWins,
    totalPoints: user.totalPoints,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * Self-service registration always creates a PARTICIPANT. Admin accounts are
 * created by the seed script or promoted directly in the database, so the role
 * can never be chosen by the person signing up.
 */
export async function registerUser(input: z.infer<typeof registerSchema>) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, { username: input.username }] },
    select: { email: true, username: true },
  });

  if (existing) {
    throw ApiError.conflict(
      existing.email === input.email
        ? 'An account with that email already exists.'
        : 'That username is taken.',
    );
  }

  const passwordHash = await hashPassword(input.password);

  return prisma.user.create({
    data: {
      email: input.email,
      username: input.username,
      displayName: input.displayName,
      passwordHash,
      role: 'PARTICIPANT',
    },
  });
}

export async function authenticate(input: z.infer<typeof loginSchema>) {
  // Accept either an email address or a username in the same field.
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, { username: input.email }] },
  });

  // Always run a comparison so a missing account and a wrong password take a
  // similar amount of time.
  const hash = user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const valid = await verifyPassword(input.password, hash);

  if (!user || !valid) {
    throw ApiError.unauthorized('Email or password is incorrect.');
  }

  return user;
}

export async function updateProfile(userId: string, input: z.infer<typeof profileUpdateSchema>) {
  const clash = await prisma.user.findFirst({
    where: { username: input.username, NOT: { id: userId } },
    select: { id: true },
  });
  if (clash) throw ApiError.conflict('That username is taken.');

  return prisma.user.update({
    where: { id: userId },
    data: {
      displayName: input.displayName,
      username: input.username,
      bio: input.bio ?? null,
      avatarUrl: input.avatarUrl ?? null,
    },
  });
}

export async function changePassword(
  userId: string,
  input: z.infer<typeof passwordChangeSchema>,
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) throw ApiError.unauthorized('Your current password is incorrect.');

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(input.newPassword) },
  });
}

/** Tournaments the user has played, newest first. */
export async function getTournamentHistory(userId: string) {
  const rows = await prisma.tournamentParticipant.findMany({
    where: { userId },
    include: {
      tournament: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          coverImageUrl: true,
          startedAt: true,
          finishedAt: true,
          createdAt: true,
          _count: { select: { questions: true, participants: true } },
        },
      },
    },
    orderBy: { joinedAt: 'desc' },
    take: 100,
  });

  return rows.map((row) => ({
    participantId: row.id,
    tournament: {
      id: row.tournament.id,
      code: row.tournament.code,
      name: row.tournament.name,
      status: row.tournament.status,
      coverImageUrl: row.tournament.coverImageUrl,
      startedAt: row.tournament.startedAt?.toISOString() ?? null,
      finishedAt: row.tournament.finishedAt?.toISOString() ?? null,
      questionCount: row.tournament._count.questions,
      participantCount: row.tournament._count.participants,
    },
    status: row.status,
    rank: row.rank,
    finalRank: row.finalRank,
    totalPoints: row.totalPoints,
    correctCount: row.correctCount,
    answeredCount: row.answeredCount,
    bestStreak: row.bestStreak,
    averageResponseMs: row.answeredCount
      ? Math.round(row.totalResponseTimeMs / row.answeredCount)
      : null,
    joinedAt: row.joinedAt.toISOString(),
  }));
}

export async function getUserOverview(userId: string) {
  const [user, history, badges, podiums] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    getTournamentHistory(userId),
    listUserBadges(userId),
    prisma.tournamentParticipant.count({ where: { userId, finalRank: { lte: 3, not: null } } }),
  ]);

  const finished = history.filter((row) => row.finalRank !== null);
  const averageRank = finished.length
    ? Math.round(finished.reduce((sum, row) => sum + (row.finalRank ?? 0), 0) / finished.length)
    : null;

  const answered = history.reduce((sum, row) => sum + row.answeredCount, 0);
  const correct = history.reduce((sum, row) => sum + row.correctCount, 0);

  return {
    user: toSessionUserDTO(user),
    stats: {
      tournamentsPlayed: history.length,
      tournamentsFinished: finished.length,
      wins: history.filter((row) => row.finalRank === 1).length,
      podiums,
      totalPoints: user.totalPoints,
      averageRank,
      accuracy: answered ? correct / answered : 0,
      bestStreak: history.reduce((max, row) => Math.max(max, row.bestStreak), 0),
    },
    badges,
    recent: history.slice(0, 5),
  };
}
