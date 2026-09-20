import { apiRoute, requireTournamentHost } from '@/lib/api-helpers';
import { jsonOk } from '@/lib/http';
import { advanceToNextQuestion, getLiveState } from '@/lib/services/tournament-service';

export const dynamic = 'force-dynamic';

/** Closes the open question (if any) and opens the next one. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  return apiRoute(request, async () => {
    const { user } = await requireTournamentHost(params.id);
    const result = await advanceToNextQuestion(params.id, user.id);
    return jsonOk({ ...result, state: await getLiveState(params.id, user.id) });
  });
}
