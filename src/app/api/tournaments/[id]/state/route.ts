import { apiRoute } from '@/lib/api-helpers';
import { jsonOk } from '@/lib/http';
import { getCurrentUser } from '@/lib/auth/session';
import { getLiveState } from '@/lib/services/tournament-service';

export const dynamic = 'force-dynamic';

/**
 * Authoritative snapshot of the live state. Clients call this on mount and
 * whenever a websocket reconnects, so a dropped connection cannot desync a
 * player from the tournament.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  return apiRoute(request, async () => {
    const user = await getCurrentUser();
    return jsonOk({ state: await getLiveState(params.id, user?.id ?? null) });
  });
}
