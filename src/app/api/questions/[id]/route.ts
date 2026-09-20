import { apiRoute, requireTournamentHost } from '@/lib/api-helpers';
import { jsonOk, parseBody } from '@/lib/http';
import {
  deleteQuestion,
  getQuestionOrThrow,
  questionInputSchema,
  toAdminQuestion,
  updateQuestion,
} from '@/lib/services/question-service';

export const dynamic = 'force-dynamic';

interface Context {
  params: { id: string };
}

export async function GET(request: Request, { params }: Context) {
  return apiRoute(request, async () => {
    const question = await getQuestionOrThrow(params.id);
    await requireTournamentHost(question.tournamentId);
    return jsonOk({ question: toAdminQuestion(question) });
  });
}

export async function PUT(request: Request, { params }: Context) {
  return apiRoute(request, async () => {
    const existing = await getQuestionOrThrow(params.id);
    await requireTournamentHost(existing.tournamentId);
    const input = await parseBody(request, questionInputSchema);
    const question = await updateQuestion(params.id, input);
    return jsonOk({ question: toAdminQuestion(question) });
  });
}

export async function DELETE(request: Request, { params }: Context) {
  return apiRoute(request, async () => {
    const existing = await getQuestionOrThrow(params.id);
    await requireTournamentHost(existing.tournamentId);
    await deleteQuestion(params.id);
    return jsonOk({ ok: true });
  });
}
