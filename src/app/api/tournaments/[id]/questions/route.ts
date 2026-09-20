import { apiRoute, requireTournamentHost, requireTournamentViewer } from '@/lib/api-helpers';
import { jsonCreated, jsonOk, parseBody } from '@/lib/http';
import {
  createQuestion,
  listQuestions,
  questionInputSchema,
  toAdminQuestion,
} from '@/lib/services/question-service';

export const dynamic = 'force-dynamic';

interface Context {
  params: { id: string };
}

/**
 * The host sees the full question, including answer keys. Everyone else only
 * ever sees counts and metadata - the answer key never leaves the server for a
 * player, not even for questions that have already closed.
 */
export async function GET(request: Request, { params }: Context) {
  return apiRoute(request, async () => {
    const { tournament, isHost } = await requireTournamentViewer(params.id);
    const questions = await listQuestions(tournament.id);

    if (isHost) {
      return jsonOk({ questions: questions.map(toAdminQuestion) });
    }

    return jsonOk({
      questions: questions.map((question, index) => ({
        id: question.id,
        index: index + 1,
        type: question.type,
        timeLimitSeconds: question.timeLimitSeconds,
        basePoints: question.basePoints,
        speedBonusPoints: question.speedBonusPoints,
        status: question.status,
      })),
    });
  });
}

export async function POST(request: Request, { params }: Context) {
  return apiRoute(request, async () => {
    await requireTournamentHost(params.id);
    const input = await parseBody(request, questionInputSchema);
    const question = await createQuestion(params.id, input);
    return jsonCreated({ question: toAdminQuestion(question) });
  });
}
