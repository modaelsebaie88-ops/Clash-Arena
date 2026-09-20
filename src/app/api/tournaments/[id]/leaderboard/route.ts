import { apiRoute, parsePagination } from '@/lib/api-helpers';
import { jsonOk } from '@/lib/http';
import { getCurrentUser } from '@/lib/auth/session';
import { getLeaderboard } from '@/lib/services/leaderboard-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  return apiRoute(request, async () => {
    const user = await getCurrentUser();
    const { limit, offset } = parsePagination(request, { limit: 50, offset: 0 });

    const leaderboard = await getLeaderboard(params.id, {
      limit,
      offset,
      includeUserId: user?.id,
    });

    return jsonOk(leaderboard);
  });
}
