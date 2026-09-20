import { apiRoute, requireTournamentHost } from '@/lib/api-helpers';
import { ApiError, jsonOk, parseBody } from '@/lib/http';
import { prisma } from '@/lib/db';
import { gradeInputSchema, gradeSubmission } from '@/lib/services/submission-service';

export const dynamic = 'force-dynamic';

/** Manual grading for image/step submissions. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  return apiRoute(request, async () => {
    const submission = await prisma.submission.findUnique({
      where: { id: params.id },
      select: { tournamentId: true },
    });
    if (!submission) throw ApiError.notFound('Submission not found.');

    const { user } = await requireTournamentHost(submission.tournamentId);
    const input = await parseBody(request, gradeInputSchema);
    const graded = await gradeSubmission(params.id, user.id, input);

    return jsonOk({
      submission: {
        id: graded.id,
        outcome: graded.outcome,
        awardedPoints: graded.awardedPoints,
        feedback: graded.feedback,
        status: graded.status,
      },
    });
  });
}
