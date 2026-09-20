import { prisma } from '../db';
import { getStandings } from './leaderboard-service';
import { listUserBadges } from './badge-service';
import { listMySubmissions } from './submission-service';
import type { LeaderboardEntryDTO, PersonalStatsDTO } from '@/types';

/** Everything the result screen and the CSV export need. */
export interface TournamentResults {
  tournament: {
    id: string;
    code: string;
    name: string;
    status: string;
    startedAt: string | null;
    finishedAt: string | null;
    totalQuestions: number;
  };
  podium: LeaderboardEntryDTO[];
  standings: LeaderboardEntryDTO[];
  stats: {
    participants: number;
    averageScore: number;
    averageResponseMs: number | null;
    correctRate: number;
    fastestAnswer: { displayName: string; responseTimeMs: number } | null;
  };
  me: {
    standing: LeaderboardEntryDTO | null;
    personal: PersonalStatsDTO;
    badges: Awaited<ReturnType<typeof listUserBadges>>;
    submissions: Awaited<ReturnType<typeof listMySubmissions>>;
  } | null;
}

export async function getTournamentResults(
  tournamentId: string,
  viewerId: string | null,
): Promise<TournamentResults> {
  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });

  const [standings, totalQuestions, aggregate, fastest] = await Promise.all([
    getStandings(tournamentId),
    prisma.question.count({ where: { tournamentId } }),
    prisma.submission.aggregate({
      where: { tournamentId, outcome: { not: 'NO_ANSWER' } },
      _avg: { responseTimeMs: true },
      _count: { _all: true },
    }),
    prisma.submission.findFirst({
      where: { tournamentId, outcome: 'CORRECT' },
      orderBy: { responseTimeMs: 'asc' },
      select: { responseTimeMs: true, user: { select: { displayName: true } } },
    }),
  ]);

  const correctCount = standings.reduce((sum, entry) => sum + entry.correctCount, 0);
  const answeredCount = standings.reduce((sum, entry) => sum + entry.answeredCount, 0);
  const averageScore = standings.length
    ? Math.round(standings.reduce((sum, entry) => sum + entry.totalPoints, 0) / standings.length)
    : 0;

  let me: TournamentResults['me'] = null;

  if (viewerId) {
    const standing = standings.find((entry) => entry.userId === viewerId) ?? null;
    if (standing) {
      const participant = await prisma.tournamentParticipant.findUnique({
        where: { tournamentId_userId: { tournamentId, userId: viewerId } },
        select: { bestRank: true, finalRank: true, fastestResponseMs: true, bestStreak: true },
      });

      const [badges, submissions] = await Promise.all([
        listUserBadges(viewerId, tournamentId),
        listMySubmissions(tournamentId, viewerId),
      ]);

      me = {
        standing,
        personal: {
          fastestAnswerMs: participant?.fastestResponseMs ?? null,
          correctCount: standing.correctCount,
          totalQuestions,
          bestStreak: participant?.bestStreak ?? standing.bestStreak,
          bestRank: participant?.bestRank ?? null,
          averageResponseMs: standing.averageResponseMs,
          totalPoints: standing.totalPoints,
          finalRank: participant?.finalRank ?? standing.rank,
        },
        badges,
        submissions,
      };
    }
  }

  return {
    tournament: {
      id: tournament.id,
      code: tournament.code,
      name: tournament.name,
      status: tournament.status,
      startedAt: tournament.startedAt?.toISOString() ?? null,
      finishedAt: tournament.finishedAt?.toISOString() ?? null,
      totalQuestions,
    },
    podium: standings.slice(0, 3),
    standings,
    stats: {
      participants: standings.length,
      averageScore,
      averageResponseMs: aggregate._avg.responseTimeMs
        ? Math.round(aggregate._avg.responseTimeMs)
        : null,
      correctRate: answeredCount ? correctCount / answeredCount : 0,
      fastestAnswer: fastest
        ? { displayName: fastest.user.displayName, responseTimeMs: fastest.responseTimeMs }
        : null,
    },
    me,
  };
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Results as CSV. A UTF-8 BOM is prepended so Excel opens it with the right
 * encoding on a double click, which covers the "Excel if practical" case
 * without pulling in a spreadsheet dependency.
 */
export async function buildResultsCsv(tournamentId: string): Promise<string> {
  const standings = await getStandings(tournamentId);

  const participants = await prisma.tournamentParticipant.findMany({
    where: { tournamentId },
    include: { user: { select: { id: true, email: true, username: true, displayName: true } } },
  });
  const byUserId = new Map(participants.map((p) => [p.userId, p] as const));

  const header = [
    'Rank',
    'Username',
    'Display Name',
    'Email',
    'Total Points',
    'Correct Answers',
    'Wrong Answers',
    'Questions Answered',
    'Average Response Time (s)',
    'Fastest Answer (s)',
    'Best Streak',
    'Final Rank',
    'Status',
  ];

  const rows = standings.map((entry) => {
    const participant = byUserId.get(entry.userId);
    return [
      entry.rank,
      entry.username,
      entry.displayName,
      participant?.user.email ?? '',
      entry.totalPoints,
      entry.correctCount,
      entry.wrongCount,
      entry.answeredCount,
      entry.averageResponseMs === null ? '' : (entry.averageResponseMs / 1000).toFixed(2),
      entry.fastestResponseMs === null ? '' : (entry.fastestResponseMs / 1000).toFixed(2),
      entry.bestStreak,
      participant?.finalRank ?? entry.rank,
      entry.status,
    ];
  });

  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}
