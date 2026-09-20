import { apiRoute, requireTournamentHost } from '@/lib/api-helpers';
import { jsonOk } from '@/lib/http';
import { getQuestionOrThrow } from '@/lib/services/question-service';
import { listSubmissionsForQuestion } from '@/lib/services/submission-service';

export const dynamic = 'force-dynamic';

/** Host-only: every answer for one question, for review and grading. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  return apiRoute(request, async () => {
    const question = await getQuestionOrThrow(params.id);
    await requireTournamentHost(question.tournamentId);
    return jsonOk({ submissions: await listSubmissionsForQuestion(params.id) });
  });
}
