import { apiRoute, requireTournamentHost } from '@/lib/api-helpers';
import { jsonOk } from '@/lib/http';
import { endTournament } from '@/lib/services/tournament-service';
import { getLiveState } from '@/lib/services/tournament-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  return apiRoute(request, async () => {
    const { user } = await requireTournamentHost(params.id);
    await endTournament(params.id, user.id);
    return jsonOk({ state: await getLiveState(params.id, user.id) });
  });
}
