import { apiRoute } from '@/lib/api-helpers';
import { jsonOk, parseBody } from '@/lib/http';
import { requireUser } from '@/lib/auth/session';
import {
  getUserOverview,
  profileUpdateSchema,
  toSessionUserDTO,
  updateProfile,
} from '@/lib/services/user-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    const user = await requireUser();
    return jsonOk(await getUserOverview(user.id));
  });
}

export async function PUT(request: Request) {
  return apiRoute(request, async () => {
    const user = await requireUser();
    const input = await parseBody(request, profileUpdateSchema);
    const updated = await updateProfile(user.id, input);
    return jsonOk({ user: toSessionUserDTO(updated) });
  });
}
