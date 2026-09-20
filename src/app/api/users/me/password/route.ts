import { apiRoute } from '@/lib/api-helpers';
import { jsonOk, parseBody } from '@/lib/http';
import { requireUser } from '@/lib/auth/session';
import { changePassword, passwordChangeSchema } from '@/lib/services/user-service';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request) {
  return apiRoute(request, async () => {
    const user = await requireUser();
    const input = await parseBody(request, passwordChangeSchema);
    await changePassword(user.id, input);
    return jsonOk({ ok: true });
  });
}
