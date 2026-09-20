import { route } from '@/lib/http';
import { requireUser } from '@/lib/auth/session';
import { readFileForViewer } from '@/lib/services/file-service';

export const dynamic = 'force-dynamic';

/**
 * Authorised file streaming. Only the uploader, an admin or the host of the
 * related tournament can read a file, and the response forces a non-executable
 * content type.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  return route(async () => {
    const user = await requireUser();
    const { record, bytes } = await readFileForViewer(params.id, {
      id: user.id,
      role: user.role,
    });

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': record.mimeType,
        'Content-Length': String(record.sizeBytes),
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, max-age=3600',
      },
    });
  });
}
