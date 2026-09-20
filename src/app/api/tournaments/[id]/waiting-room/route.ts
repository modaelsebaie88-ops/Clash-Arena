import { apiRoute, requireTournamentHost, requireTournamentViewer } from '@/lib/api-helpers';
import { jsonOk } from '@/lib/http';
import { listWaitingRoom } from '@/lib/services/participant-service';
import { getLiveState, openWaitingRoom } from '@/lib/services/tournament-service';

export const dynamic = 'force-dynamic';

interface Context {
  params: { id: string };
}

export async function GET(request: Request, { params }: Context) {
  return apiRoute(request, async () => {
    const { user } = await requireTournamentViewer(params.id);
    return jsonOk({
      participants: await listWaitingRoom(params.id),
      state: await getLiveState(params.id, user.id),
    });
  });
}

/** Moves a published tournament into the live waiting room. */
export async function POST(request: Request, { params }: Context) {
  return apiRoute(request, async () => {
    const { user } = await requireTournamentHost(params.id);
    await openWaitingRoom(params.id, user.id);
    return jsonOk({ state: await getLiveState(params.id, user.id) });
  });
}
