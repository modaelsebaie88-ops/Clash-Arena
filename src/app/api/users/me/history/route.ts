import { apiRoute } from '@/lib/api-helpers';
import { jsonOk } from '@/lib/http';
import { requireUser } from '@/lib/auth/session';
import { getTournamentHistory } from '@/lib/services/user-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    const user = await requireUser();
    return jsonOk({ history: await getTournamentHistory(user.id) });
  });
}
