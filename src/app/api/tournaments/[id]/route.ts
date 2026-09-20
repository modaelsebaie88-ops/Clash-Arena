import { apiRoute, requireTournamentHost } from '@/lib/api-helpers';
import { jsonOk, parseBody } from '@/lib/http';
import { getCurrentUser } from '@/lib/auth/session';
import {
  deleteTournament,
  getTournamentOrThrow,
  parseScoringConfig,
  toSummary,
  tournamentInputSchema,
  updateTournament,
} from '@/lib/services/tournament-service';
import { parseTieBreakers } from '@/lib/services/leaderboard-service';

export const dynamic = 'force-dynamic';

interface Context {
  params: { id: string };
}

export async function GET(request: Request, { params }: Context) {
  return apiRoute(request, async () => {
    const viewer = await getCurrentUser();
    const tournament = await getTournamentOrThrow(params.id);
    const summary = await toSummary(tournament, { viewerId: viewer?.id ?? null });

    const isHost = viewer?.id === tournament.hostId;

    return jsonOk({
      tournament: {
        ...summary,
        rules: tournament.rules,
        allowLateJoin: tournament.allowLateJoin,
        showLeaderboardAfterQuestion: tournament.showLeaderboardAfterQuestion,
        showAnswersToParticipants: tournament.showAnswersToParticipants,
        defaultTimeLimitSeconds: tournament.defaultTimeLimitSeconds,
        defaultBasePoints: tournament.defaultBasePoints,
        // Scoring rules are public: players should know how points are earned.
        scoringConfig: parseScoringConfig(tournament.scoringConfig),
        tieBreakers: parseTieBreakers(tournament.tieBreakers),
        ...(isHost ? { hostView: true } : {}),
      },
    });
  });
}

export async function PUT(request: Request, { params }: Context) {
  return apiRoute(request, async () => {
    const { user } = await requireTournamentHost(params.id);
    const input = await parseBody(request, tournamentInputSchema);
    const tournament = await updateTournament(params.id, input, user.id);
    return jsonOk({ tournament: await toSummary(tournament, { viewerId: user.id }) });
  });
}

export async function DELETE(request: Request, { params }: Context) {
  return apiRoute(request, async () => {
    await requireTournamentHost(params.id);
    await deleteTournament(params.id);
    return jsonOk({ ok: true });
  });
}
