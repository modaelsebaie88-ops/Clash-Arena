import { apiRoute } from '@/lib/api-helpers';
import { clientIp, jsonCreated, parseBody } from '@/lib/http';
import { requireUser } from '@/lib/auth/session';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit';
import { answerPayloadSchema, submitAnswer } from '@/lib/services/submission-service';

export const dynamic = 'force-dynamic';

/**
 * The only way to answer a question.
 *
 * The response deliberately contains no correctness or score information: that
 * is published to everyone at once when the question closes. Timing is measured
 * from the server clock, so nothing the client sends can influence the score.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  return apiRoute(request, async () => {
    const user = await requireUser();

    await enforceRateLimit({
      bucket: 'question:submit',
      identity: `${user.id}:${clientIp(request)}`,
      ...RATE_LIMITS.submit,
      message: 'Slow down - too many submissions.',
    });

    const answer = await parseBody(request, answerPayloadSchema);
    const result = await submitAnswer({ questionId: params.id, userId: user.id, answer });

    return jsonCreated(result);
  });
}
