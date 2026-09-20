import { apiRoute, parsePagination } from '@/lib/api-helpers';
import { jsonCreated, jsonOk, parseBody } from '@/lib/http';
import { getCurrentUser, requireAdmin } from '@/lib/auth/session';
import {
  createTournament,
  listTournaments,
  toSummary,
  tournamentInputSchema,
} from '@/lib/services/tournament-service';
import type { TournamentStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    const user = await getCurrentUser();
    const url = new URL(request.url);
    const { limit, offset } = parsePagination(request);

    const scope = url.searchParams.get('scope');
    const statusParam = url.searchParams.get('status');
    const statuses = statusParam
      ? (statusParam.split(',').filter(Boolean) as TournamentStatus[])
      : undefined;

    // `scope=hosted` is the admin list; everything else is the public browse
    // list, which never exposes drafts.
    const hosted = scope === 'hosted';
    if (hosted) await requireAdmin();

    const result = await listTournaments({
      viewerId: user?.id ?? null,
      hostId: hosted ? user?.id : undefined,
      statuses,
      search: url.searchParams.get('search') ?? undefined,
      publicOnly: !hosted,
      limit,
      offset,
    });

    return jsonOk(result);
  });
}

export async function POST(request: Request) {
  return apiRoute(request, async () => {
    const user = await requireAdmin();
    const input = await parseBody(request, tournamentInputSchema);
    const tournament = await createTournament(user.id, input);
    return jsonCreated({ tournament: await toSummary(tournament, { viewerId: user.id }) });
  });
}
