import { apiRoute } from '@/lib/api-helpers';
import { jsonOk } from '@/lib/http';
import { requireAdmin } from '@/lib/auth/session';
import { getPlatformAnalytics } from '@/lib/services/analytics-service';

export const dynamic = 'force-dynamic';

/** Numbers for the admin landing page, scoped to the signed-in host. */
export async function GET(request: Request) {
  return apiRoute(request, async () => {
    const user = await requireAdmin();
    return jsonOk(await getPlatformAnalytics(user.id));
  });
}
