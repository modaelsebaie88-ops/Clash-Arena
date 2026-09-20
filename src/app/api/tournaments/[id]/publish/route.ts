import { apiRoute, requireTournamentHost } from '@/lib/api-helpers';
import { jsonOk } from '@/lib/http';
import {
  publishTournament,
  toSummary,
  unpublishTournament,
} from '@/lib/services/tournament-service';

export const dynamic = 'force-dynamic';

interface Context {
  params: { id: string };
}

export async function POST(request: Request, { params }: Context) {
  return apiRoute(request, async () => {
    const { user } = await requireTournamentHost(params.id);
    const tournament = await publishTournament(params.id, user.id);
    return jsonOk({ tournament: await toSummary(tournament, { viewerId: user.id }) });
  });
}

export async function DELETE(request: Request, { params }: Context) {
  return apiRoute(request, async () => {
    const { user } = await requireTournamentHost(params.id);
    const tournament = await unpublishTournament(params.id, user.id);
    return jsonOk({ tournament: await toSummary(tournament, { viewerId: user.id }) });
  });
}
