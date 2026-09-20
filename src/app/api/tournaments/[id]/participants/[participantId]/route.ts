import { z } from 'zod';
import { apiRoute, requireTournamentHost } from '@/lib/api-helpers';
import { ApiError, jsonOk, parseBody } from '@/lib/http';
import { prisma } from '@/lib/db';
import {
  approveParticipant,
  disqualifyParticipant,
  reinstateParticipant,
} from '@/lib/services/participant-service';
import { overrideParticipantScore } from '@/lib/services/submission-service';

export const dynamic = 'force-dynamic';

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('APPROVE') }),
  z.object({ action: z.literal('DISQUALIFY'), reason: z.string().max(300).nullish() }),
  z.object({ action: z.literal('REINSTATE') }),
  z.object({
    action: z.literal('ADJUST_SCORE'),
    points: z.number().int().min(-10000).max(10000),
    note: z.string().max(300).nullish(),
  }),
]);

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; participantId: string } },
) {
  return apiRoute(request, async () => {
    const { user } = await requireTournamentHost(params.id);

    const participant = await prisma.tournamentParticipant.findUnique({
      where: { id: params.participantId },
      select: { tournamentId: true },
    });
    if (!participant || participant.tournamentId !== params.id) {
      throw ApiError.notFound('Participant not found in this tournament.');
    }

    const input = await parseBody(request, actionSchema);

    switch (input.action) {
      case 'APPROVE':
        return jsonOk({ participant: await approveParticipant(params.participantId, user.id) });
      case 'DISQUALIFY':
        return jsonOk({
          participant: await disqualifyParticipant(params.participantId, user.id, input.reason ?? null),
        });
      case 'REINSTATE':
        return jsonOk({ participant: await reinstateParticipant(params.participantId, user.id) });
      case 'ADJUST_SCORE':
        return jsonOk({
          participant: await overrideParticipantScore(params.participantId, user.id, {
            points: input.points,
            note: input.note ?? null,
          }),
        });
      default:
        throw ApiError.badRequest('Unknown action.');
    }
  });
}
