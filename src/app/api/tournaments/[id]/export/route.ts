import { requireTournamentHost } from '@/lib/api-helpers';
import { route } from '@/lib/http';
import { TOURNAMENT_EVENT } from '@/lib/realtime/events';
import { logTournamentEvent } from '@/lib/services/event-log-service';
import { buildResultsCsv } from '@/lib/services/results-service';

export const dynamic = 'force-dynamic';

/** CSV download. The BOM makes Excel open it with the correct encoding. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  return route(async () => {
    const { user, tournament } = await requireTournamentHost(params.id);
    const csv = await buildResultsCsv(params.id);

    await logTournamentEvent({
      tournamentId: params.id,
      type: TOURNAMENT_EVENT.RESULTS_EXPORTED,
      actorId: user.id,
    });

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="' + tournament.code + '-results.csv"',
        'Cache-Control': 'no-store',
      },
    });
  });
}
