import { apiRoute, requireTournamentHost } from '@/lib/api-helpers';
import { jsonOk } from '@/lib/http';
import { listTournamentEvents } from '@/lib/services/event-log-service';

export const dynamic = 'force-dynamic';

/** Audit trail for the host: who did what, and when. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  return apiRoute(request, async () => {
    await requireTournamentHost(params.id);
    const events = await listTournamentEvents(params.id, 150);
    return jsonOk({
      events: events.map((event) => ({
        id: event.id,
        type: event.type,
        payload: event.payload,
        createdAt: event.createdAt.toISOString(),
        actor: event.actor ? { id: event.actor.id, displayName: event.actor.displayName } : null,
      })),
    });
  });
}
