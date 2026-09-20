import { apiRoute } from '@/lib/api-helpers';
import { jsonOk } from '@/lib/http';
import { getCurrentUser } from '@/lib/auth/session';
import { toSessionUserDTO } from '@/lib/services/user-service';
import { countUnread } from '@/lib/services/notification-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    const user = await getCurrentUser();
    if (!user) return jsonOk({ user: null, unreadNotifications: 0 });

    return jsonOk({
      user: toSessionUserDTO(user),
      unreadNotifications: await countUnread(user.id),
    });
  });
}
