import { apiRoute, requireTournamentHost } from '@/lib/api-helpers';
import { jsonOk } from '@/lib/http';
import { listPendingReview } from '@/lib/services/submission-service';

export const dynamic = 'force-dynamic';

/** Queue of image/step answers waiting for the host to grade them. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  return apiRoute(request, async () => {
    await requireTournamentHost(params.id);
    return jsonOk({ submissions: await listPendingReview(params.id) });
  });
}
