import { z } from 'zod';
import { apiRoute } from '@/lib/api-helpers';
import { jsonOk, parseBody } from '@/lib/http';
import { requireUser } from '@/lib/auth/session';
import {
  countUnread,
  listNotifications,
  markNotificationsRead,
} from '@/lib/services/notification-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    const user = await requireUser();
    const url = new URL(request.url);

    return jsonOk({
      notifications: await listNotifications(user.id, {
        limit: Number(url.searchParams.get('limit') ?? 30),
        unreadOnly: url.searchParams.get('unread') === 'true',
      }),
      unread: await countUnread(user.id),
    });
  });
}

const markSchema = z.object({ ids: z.array(z.string()).optional() });

export async function PATCH(request: Request) {
  return apiRoute(request, async () => {
    const user = await requireUser();
    const { ids } = await parseBody(request, markSchema);
    const updated = await markNotificationsRead(user.id, ids);
    return jsonOk({ updated, unread: await countUnread(user.id) });
  });
}
