import { z } from 'zod';
import { apiRoute } from '@/lib/api-helpers';
import { clientIp, jsonOk, parseBody } from '@/lib/http';
import { requireUser } from '@/lib/auth/session';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit';
import { joinTournament } from '@/lib/services/participant-service';
import { getLiveState } from '@/lib/services/tournament-service';

export const dynamic = 'force-dynamic';

const joinSchema = z.object({ code: z.string().trim().max(24).optional() });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  return apiRoute(request, async () => {
    const user = await requireUser();
    await enforceRateLimit({
      bucket: 'tournament:join',
      identity: `${user.id}:${clientIp(request)}`,
      ...RATE_LIMITS.join,
    });

    const body = await parseBody(request, joinSchema);
    const result = await joinTournament(user.id, { tournamentId: params.id, code: body.code });

    return jsonOk({
      participantId: result.participant.id,
      alreadyJoined: result.alreadyJoined,
      pendingApproval: result.pendingApproval,
      state: await getLiveState(result.tournamentId, user.id),
    });
  });
}
