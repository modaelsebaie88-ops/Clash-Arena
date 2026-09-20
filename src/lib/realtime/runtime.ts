/**
 * Server-side question deadlines.
 *
 * The browser countdown is decoration. The authoritative deadline is
 * Tournament.questionEndsAt in the database, and this module holds the timer
 * that closes the question when that moment arrives - even if not a single
 * client is connected.
 *
 * Timers are registered per tournament on globalThis so the Next.js route
 * handlers (which start and pause questions) and the websocket server share one
 * registry inside the same process.
 */

interface RuntimeRegistry {
  timers: Map<string, NodeJS.Timeout>;
}

const globalForRuntime = globalThis as unknown as { __clashArenaRuntime?: RuntimeRegistry };

function registry(): RuntimeRegistry {
  if (!globalForRuntime.__clashArenaRuntime) {
    globalForRuntime.__clashArenaRuntime = { timers: new Map() };
  }
  return globalForRuntime.__clashArenaRuntime;
}

export function cancelQuestionTimer(tournamentId: string): void {
  const { timers } = registry();
  const timer = timers.get(tournamentId);
  if (timer) {
    clearTimeout(timer);
    timers.delete(tournamentId);
  }
}

/**
 * Schedules the automatic close of the open question. Safe to call repeatedly:
 * any previous timer for the tournament is cancelled first.
 */
export function scheduleQuestionClose(
  tournamentId: string,
  questionId: string,
  endsAt: Date,
): void {
  cancelQuestionTimer(tournamentId);

  const delay = Math.max(0, endsAt.getTime() - Date.now());
  const timer = setTimeout(() => {
    registry().timers.delete(tournamentId);
    // Imported lazily to keep this module free of a cycle with the service that
    // schedules the timer in the first place.
    import('../services/tournament-service')
      .then(({ closeActiveQuestion }) =>
        closeActiveQuestion(tournamentId, { questionId, reason: 'TIME_EXPIRED' }),
      )
      .catch((error) => {
        console.error(`[runtime] failed to auto-close question ${questionId}:`, error);
      });
  }, delay);

  // Never keep the process alive just for a pending question timer.
  if (typeof timer.unref === 'function') timer.unref();

  registry().timers.set(tournamentId, timer);
}

export function hasScheduledClose(tournamentId: string): boolean {
  return registry().timers.has(tournamentId);
}

/**
 * Called once when the server boots. Any question that was open when the
 * process stopped is either rescheduled or closed immediately, so a restart
 * mid-tournament cannot strand players on a frozen question.
 */
export async function reconcileLiveTournaments(): Promise<void> {
  const { prisma } = await import('../db');
  const { closeActiveQuestion } = await import('../services/tournament-service');

  const live = await prisma.tournament.findMany({
    where: { status: 'LIVE', currentQuestionId: { not: null } },
    select: { id: true, currentQuestionId: true, questionEndsAt: true, name: true },
  });

  for (const tournament of live) {
    if (!tournament.currentQuestionId) continue;

    if (!tournament.questionEndsAt || tournament.questionEndsAt.getTime() <= Date.now()) {
      console.log(`[runtime] closing overdue question for "${tournament.name}"`);
      await closeActiveQuestion(tournament.id, {
        questionId: tournament.currentQuestionId,
        reason: 'TIME_EXPIRED',
      }).catch((error) => console.error('[runtime] reconcile close failed:', error));
    } else {
      console.log(
        `[runtime] rescheduling question close for "${tournament.name}" at ${tournament.questionEndsAt.toISOString()}`,
      );
      scheduleQuestionClose(tournament.id, tournament.currentQuestionId, tournament.questionEndsAt);
    }
  }
}
