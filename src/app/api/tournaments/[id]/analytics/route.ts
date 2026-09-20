import { apiRoute, requireTournamentHost } from '@/lib/api-helpers';
import { jsonOk } from '@/lib/http';
import { getTournamentAnalytics } from '@/lib/services/analytics-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  return apiRoute(request, async () => {
    await requireTournamentHost(params.id);
    return jsonOk(await getTournamentAnalytics(params.id));
  });
}
