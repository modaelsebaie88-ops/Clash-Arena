import { apiRoute, requireTournamentHost } from '@/lib/api-helpers';
import { jsonOk } from '@/lib/http';
import { listParticipants } from '@/lib/services/participant-service';

export const dynamic = 'force-dynamic';

/** Host-only. Includes email addresses, which players never see about others. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  return apiRoute(request, async () => {
    await requireTournamentHost(params.id);
    return jsonOk({ participants: await listParticipants(params.id) });
  });
}
