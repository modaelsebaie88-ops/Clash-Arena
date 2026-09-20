import { apiRoute, requireTournamentHost } from '@/lib/api-helpers';
import { jsonOk } from '@/lib/http';
import { archiveTournament, toSummary } from '@/lib/services/tournament-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  return apiRoute(request, async () => {
    const { user } = await requireTournamentHost(params.id);
    const tournament = await archiveTournament(params.id, user.id);
    return jsonOk({ tournament: await toSummary(tournament, { viewerId: user.id }) });
  });
}
