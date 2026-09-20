import { z } from 'zod';
import { apiRoute } from '@/lib/api-helpers';
import { clientIp, jsonOk, parseBody } from '@/lib/http';
import { requireUser } from '@/lib/auth/session';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit';
import { joinTournament } from '@/lib/services/participant-service';

export const dynamic = 'force-dynamic';

const joinByCodeSchema = z.object({
  code: z.string().trim().min(4, 'Enter the tournament code').max(24),
});

/** Join with nothing but a code, the flow behind the big JOIN button. */
export async function POST(request: Request) {
  return apiRoute(request, async () => {
    const user = await requireUser();
    await enforceRateLimit({
      bucket: 'tournament:join-code',
      identity: `${user.id}:${clientIp(request)}`,
      ...RATE_LIMITS.join,
    });

    const { code } = await parseBody(request, joinByCodeSchema);
    const result = await joinTournament(user.id, { code });

    return jsonOk({
      tournamentId: result.tournamentId,
      participantId: result.participant.id,
      alreadyJoined: result.alreadyJoined,
      pendingApproval: result.pendingApproval,
    });
  });
}
