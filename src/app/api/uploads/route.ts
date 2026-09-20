import { apiRoute } from '@/lib/api-helpers';
import { ApiError, clientIp, jsonCreated } from '@/lib/http';
import { requireUser } from '@/lib/auth/session';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit';
import { publicUrlFor, saveUpload, type UploadPurpose } from '@/lib/services/file-service';

export const dynamic = 'force-dynamic';

const PURPOSES: UploadPurpose[] = ['SUBMISSION', 'QUESTION', 'COVER', 'AVATAR'];

/**
 * Multipart image upload. Size, declared MIME type and real magic bytes are all
 * checked, the filename is generated server side, and the file lands outside
 * ./public so it can only be read back through an authorised route.
 */
export async function POST(request: Request) {
  return apiRoute(request, async () => {
    const user = await requireUser();

    await enforceRateLimit({
      bucket: 'upload',
      identity: `${user.id}:${clientIp(request)}`,
      ...RATE_LIMITS.upload,
    });

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 'Send the image as multipart/form-data.');
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw ApiError.badRequest('No file was uploaded.');

    const requested = String(form.get('purpose') ?? 'SUBMISSION').toUpperCase() as UploadPurpose;
    const purpose = PURPOSES.includes(requested) ? requested : 'SUBMISSION';

    const saved = await saveUpload({
      file,
      ownerId: user.id,
      purpose,
      tournamentId: (form.get('tournamentId') as string | null) || null,
      questionId: (form.get('questionId') as string | null) || null,
    });

    return jsonCreated({
      file: {
        id: saved.id,
        url: publicUrlFor(saved),
        mimeType: saved.mimeType,
        sizeBytes: saved.sizeBytes,
        originalName: saved.originalName,
      },
    });
  });
}
