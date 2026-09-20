import { apiRoute, requireTournamentViewer } from '@/lib/api-helpers';
import { jsonOk } from '@/lib/http';
import { getTournamentResults } from '@/lib/services/results-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  return apiRoute(request, async () => {
    const { user } = await requireTournamentViewer(params.id);
    return jsonOk(await getTournamentResults(params.id, user.id));
  });
}
