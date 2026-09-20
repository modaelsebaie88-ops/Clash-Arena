import { apiRoute, requireTournamentHost } from '@/lib/api-helpers';
import { jsonOk } from '@/lib/http';
import { closeActiveQuestion, getLiveState } from '@/lib/services/tournament-service';

export const dynamic = 'force-dynamic';

/**
 * Closes the open round without opening the next one.
 *
 * This is what gives players their result beat: scores publish, the board
 * moves, and everyone sits on the recap until the host calls the next round.
 * Advancing straight from one question to the next would skip that entirely.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  return apiRoute(request, async () => {
    const { user } = await requireTournamentHost(params.id);
    const result = await closeActiveQuestion(params.id, {
      reason: 'HOST_CLOSED',
      actorId: user.id,
    });
    return jsonOk({ ...result, state: await getLiveState(params.id, user.id) });
  });
}
