import { apiRoute } from '@/lib/api-helpers';
import { jsonOk } from '@/lib/http';
import { requireUser } from '@/lib/auth/session';
import { listMySubmissions } from '@/lib/services/submission-service';

export const dynamic = 'force-dynamic';

/** A player's own answers. Grading detail appears only once a question closes. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  return apiRoute(request, async () => {
    const user = await requireUser();
    return jsonOk({ submissions: await listMySubmissions(params.id, user.id) });
  });
}
