import { prisma } from '../db';
import { getStandings, getSnapshots } from './leaderboard-service';
import type { LeaderboardEntryDTO } from '@/types';

/**
 * Post-tournament analytics. Everything is derived from submissions and
 * leaderboard snapshots, so the numbers always reconcile with the result page.
 */

export interface QuestionAnalytics {
  questionId: string;
  order: number;
  index: number;
  prompt: string;
  type: string;
  submitted: number;
  noAnswer: number;
  correct: number;
  incorrect: number;
  pendingReview: number;
  correctRate: number;
  averageResponseMs: number | null;
  fastestResponseMs: number | null;
  optionBreakdown: Array<{ label: string; count: number; isCorrect: boolean }>;
}

export interface TournamentAnalytics {
  tournament: {
    id: string;
    name: string;
    code: string;
    status: string;
    startedAt: string | null;
    finishedAt: string | null;
  };
  summary: {
    participants: number;
    activeParticipants: number;
    questions: number;
    totalSubmissions: number;
    answeredSubmissions: number;
    averageScore: number;
    medianScore: number;
    topScore: number;
    averageResponseMs: number | null;
    correctRate: number;
    participationRate: number;
  };
  questions: QuestionAnalytics[];
  scoreDistribution: Array<{ bucket: string; count: number }>;
  responseTimeDistribution: Array<{ bucket: string; count: number }>;
  rankProgression: Array<{
    userId: string;
    displayName: string;
    points: Array<{ questionOrder: number; rank: number; points: number }>;
  }>;
  highlights: {
    hardestQuestion: { index: number; prompt: string; correctRate: number } | null;
    easiestQuestion: { index: number; prompt: string; correctRate: number } | null;
    fastestAnswer: { displayName: string; responseTimeMs: number; questionIndex: number } | null;
    biggestComeback: { displayName: string; from: number; to: number } | null;
  };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

function bucketScores(scores: number[]): Array<{ bucket: string; count: number }> {
  if (!scores.length) return [];
  const max = Math.max(...scores, 1);
  const step = Math.max(50, Math.ceil(max / 8 / 50) * 50);
  const buckets = new Map<number, number>();

  for (const score of scores) {
    const index = Math.floor(score / step);
    buckets.set(index, (buckets.get(index) ?? 0) + 1);
  }

  const highest = Math.max(...Array.from(buckets.keys()));
  return Array.from({ length: highest + 1 }, (_, index) => ({
    bucket: `${index * step}-${(index + 1) * step - 1}`,
    count: buckets.get(index) ?? 0,
  }));
}

function bucketResponseTimes(times: number[]): Array<{ bucket: string; count: number }> {
  if (!times.length) return [];
  const edges = [2, 5, 10, 15, 20, 30, 45, 60];
  const counts = new Array(edges.length + 1).fill(0);

  for (const ms of times) {
    const seconds = ms / 1000;
    const index = edges.findIndex((edge) => seconds <= edge);
    counts[index === -1 ? edges.length : index] += 1;
  }

  return counts.map((count, index) => ({
    bucket: index === edges.length ? `${edges[edges.length - 1]}s+` : `≤${edges[index]}s`,
    count,
  }));
}

export async function getTournamentAnalytics(tournamentId: string): Promise<TournamentAnalytics> {
  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });

  const [questions, participants, submissions, standings, snapshots] = await Promise.all([
    prisma.question.findMany({
      where: { tournamentId },
      include: { options: { orderBy: { order: 'asc' } } },
      orderBy: { order: 'asc' },
    }),
    prisma.tournamentParticipant.findMany({
      where: { tournamentId },
      include: { user: { select: { id: true, displayName: true } } },
    }),
    prisma.submission.findMany({
      where: { tournamentId },
      select: {
        questionId: true,
        outcome: true,
        status: true,
        responseTimeMs: true,
        answer: true,
        userId: true,
      },
    }),
    getStandings(tournamentId),
    getSnapshots(tournamentId),
  ]);

  const activeParticipants = participants.filter((p) => p.status === 'ACTIVE');
  const scores = activeParticipants.map((p) => p.totalPoints);
  const answered = submissions.filter((s) => s.outcome !== 'NO_ANSWER');
  const correct = submissions.filter((s) => s.outcome === 'CORRECT' || s.outcome === 'PARTIAL');

  const displayNameByUser = new Map(participants.map((p) => [p.userId, p.user.displayName] as const));

  const questionAnalytics: QuestionAnalytics[] = questions.map((question, position) => {
    const rows = submissions.filter((s) => s.questionId === question.id);
    const answeredRows = rows.filter((s) => s.outcome !== 'NO_ANSWER');
    const correctRows = rows.filter((s) => s.outcome === 'CORRECT' || s.outcome === 'PARTIAL');
    const responseTimes = answeredRows.map((s) => s.responseTimeMs);

    const optionCounts = new Map<string, number>();
    for (const row of answeredRows) {
      const optionId = (row.answer as { optionId?: string } | null)?.optionId;
      if (optionId) optionCounts.set(optionId, (optionCounts.get(optionId) ?? 0) + 1);
    }

    return {
      questionId: question.id,
      order: question.order,
      index: position + 1,
      prompt: question.prompt,
      type: question.type,
      submitted: answeredRows.length,
      noAnswer: rows.length - answeredRows.length,
      correct: correctRows.length,
      incorrect: answeredRows.length - correctRows.length,
      pendingReview: rows.filter((s) => s.status === 'PENDING_REVIEW').length,
      correctRate: rows.length ? correctRows.length / rows.length : 0,
      averageResponseMs: responseTimes.length
        ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length)
        : null,
      fastestResponseMs: responseTimes.length ? Math.min(...responseTimes) : null,
      optionBreakdown: question.options.map((option) => ({
        label: option.text,
        count: optionCounts.get(option.id) ?? 0,
        isCorrect: option.isCorrect,
      })),
    };
  });

  const rankProgression = buildRankProgression(snapshots, standings);

  const ranked = [...questionAnalytics].filter((q) => q.submitted + q.noAnswer > 0);
  const hardest = ranked.length
    ? ranked.reduce((min, q) => (q.correctRate < min.correctRate ? q : min))
    : null;
  const easiest = ranked.length
    ? ranked.reduce((max, q) => (q.correctRate > max.correctRate ? q : max))
    : null;

  const fastestRow = answered.length
    ? answered.reduce((min, row) => (row.responseTimeMs < min.responseTimeMs ? row : min))
    : null;
  const fastestQuestionIndex = fastestRow
    ? questionAnalytics.find((q) => q.questionId === fastestRow.questionId)?.index ?? 0
    : 0;

  const biggestComeback = findBiggestComeback(rankProgression, displayNameByUser);

  return {
    tournament: {
      id: tournament.id,
      name: tournament.name,
      code: tournament.code,
      status: tournament.status,
      startedAt: tournament.startedAt?.toISOString() ?? null,
      finishedAt: tournament.finishedAt?.toISOString() ?? null,
    },
    summary: {
      participants: participants.length,
      activeParticipants: activeParticipants.length,
      questions: questions.length,
      totalSubmissions: submissions.length,
      answeredSubmissions: answered.length,
      averageScore: scores.length
        ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
        : 0,
      medianScore: median(scores),
      topScore: scores.length ? Math.max(...scores) : 0,
      averageResponseMs: answered.length
        ? Math.round(answered.reduce((sum, row) => sum + row.responseTimeMs, 0) / answered.length)
        : null,
      correctRate: submissions.length ? correct.length / submissions.length : 0,
      participationRate:
        questions.length && activeParticipants.length
          ? answered.length / (questions.length * activeParticipants.length)
          : 0,
    },
    questions: questionAnalytics,
    scoreDistribution: bucketScores(scores),
    responseTimeDistribution: bucketResponseTimes(answered.map((s) => s.responseTimeMs)),
    rankProgression,
    highlights: {
      hardestQuestion: hardest
        ? { index: hardest.index, prompt: hardest.prompt, correctRate: hardest.correctRate }
        : null,
      easiestQuestion: easiest
        ? { index: easiest.index, prompt: easiest.prompt, correctRate: easiest.correctRate }
        : null,
      fastestAnswer: fastestRow
        ? {
            displayName: displayNameByUser.get(fastestRow.userId) ?? 'Unknown',
            responseTimeMs: fastestRow.responseTimeMs,
            questionIndex: fastestQuestionIndex,
          }
        : null,
      biggestComeback,
    },
  };
}

type SnapshotRow = Awaited<ReturnType<typeof getSnapshots>>[number];

function buildRankProgression(snapshots: SnapshotRow[], standings: LeaderboardEntryDTO[]) {
  const tracked = standings.slice(0, 10);
  const trackedIds = new Set(tracked.map((entry) => entry.userId));

  const series = new Map<string, { userId: string; displayName: string; points: Array<{ questionOrder: number; rank: number; points: number }> }>();
  for (const entry of tracked) {
    series.set(entry.userId, { userId: entry.userId, displayName: entry.displayName, points: [] });
  }

  for (const snapshot of snapshots) {
    const rows = (snapshot.standings ?? []) as unknown as LeaderboardEntryDTO[];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!trackedIds.has(row.userId)) continue;
      series.get(row.userId)?.points.push({
        questionOrder: (snapshot.questionOrder ?? -1) + 1,
        rank: row.rank,
        points: row.totalPoints,
      });
    }
  }

  return Array.from(series.values());
}

function findBiggestComeback(
  progression: ReturnType<typeof buildRankProgression>,
  displayNames: Map<string, string>,
) {
  let best: { displayName: string; from: number; to: number } | null = null;

  for (const series of progression) {
    if (series.points.length < 2) continue;
    const worst = Math.max(...series.points.map((p) => p.rank));
    const final = series.points[series.points.length - 1].rank;
    const climbed = worst - final;
    if (climbed > 0 && (!best || climbed > best.from - best.to)) {
      best = {
        displayName: displayNames.get(series.userId) ?? series.displayName,
        from: worst,
        to: final,
      };
    }
  }

  return best;
}

/** Cross-tournament numbers for the admin overview page. */
export async function getPlatformAnalytics(hostId?: string) {
  const where = hostId ? { hostId } : {};

  const [tournaments, participants, submissions, users] = await Promise.all([
    prisma.tournament.findMany({
      where,
      select: { id: true, name: true, status: true, code: true, createdAt: true, finishedAt: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.tournamentParticipant.count(hostId ? { where: { tournament: { hostId } } } : undefined),
    prisma.submission.aggregate({
      where: hostId ? { tournament: { hostId } } : {},
      _count: { _all: true },
      _avg: { responseTimeMs: true },
    }),
    prisma.user.count({ where: { role: 'PARTICIPANT' } }),
  ]);

  const byStatus = tournaments.reduce<Record<string, number>>((acc, tournament) => {
    acc[tournament.status] = (acc[tournament.status] ?? 0) + 1;
    return acc;
  }, {});

  return {
    totals: {
      tournaments: tournaments.length,
      participants,
      submissions: submissions._count._all,
      players: users,
      averageResponseMs: submissions._avg.responseTimeMs
        ? Math.round(submissions._avg.responseTimeMs)
        : null,
    },
    byStatus,
    recent: tournaments.slice(0, 8),
  };
}
