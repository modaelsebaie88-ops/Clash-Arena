import { z } from 'zod';
import { apiRoute, requireTournamentHost } from '@/lib/api-helpers';
import { jsonOk, parseBody } from '@/lib/http';
import { listQuestions, reorderQuestions, toAdminQuestion } from '@/lib/services/question-service';

export const dynamic = 'force-dynamic';

const reorderSchema = z.object({ orderedIds: z.array(z.string().min(1)).min(1) });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  return apiRoute(request, async () => {
    await requireTournamentHost(params.id);
    const { orderedIds } = await parseBody(request, reorderSchema);
    await reorderQuestions(params.id, orderedIds);
    const questions = await listQuestions(params.id);
    return jsonOk({ questions: questions.map(toAdminQuestion) });
  });
}
