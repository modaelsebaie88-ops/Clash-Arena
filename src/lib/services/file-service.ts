import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { UploadedFile } from '@prisma/client';
import { prisma } from '../db';
import { getEnv } from '../env';
import { ApiError } from '../http';

/**
 * Upload handling.
 *
 * Files are written outside ./public and are only ever served back through an
 * authorised route handler, so an uploaded file cannot be linked publicly and
 * can never be executed by the static file server. Both the declared MIME type
 * and the real magic bytes must match an allowed image format.
 */

export type UploadPurpose = 'SUBMISSION' | 'QUESTION' | 'COVER' | 'AVATAR';

const ALLOWED: Record<string, { ext: string; matches: (bytes: Uint8Array) => boolean }> = {
  'image/png': {
    ext: 'png',
    matches: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  'image/jpeg': {
    ext: 'jpg',
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  'image/webp': {
    ext: 'webp',
    matches: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  'image/heic': { ext: 'heic', matches: isHeif },
  'image/heif': { ext: 'heif', matches: isHeif },
};

function isHeif(bytes: Uint8Array): boolean {
  // ISO base media file: 4-byte size, then "ftyp", then a brand such as heic.
  if (bytes[4] !== 0x66 || bytes[5] !== 0x74 || bytes[6] !== 0x79 || bytes[7] !== 0x70) return false;
  const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
  return ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand);
}

export const ALLOWED_MIME_TYPES = Object.keys(ALLOWED);

function uploadRoot(): string {
  const { UPLOAD_DIR } = getEnv();
  return path.isAbsolute(UPLOAD_DIR) ? UPLOAD_DIR : path.join(process.cwd(), UPLOAD_DIR);
}

export interface SaveUploadInput {
  file: File;
  ownerId: string;
  purpose: UploadPurpose;
  tournamentId?: string | null;
  questionId?: string | null;
}

export async function saveUpload(input: SaveUploadInput): Promise<UploadedFile> {
  const { MAX_UPLOAD_MB } = getEnv();
  const maxBytes = MAX_UPLOAD_MB * 1024 * 1024;

  if (!input.file || typeof input.file.arrayBuffer !== 'function') {
    throw ApiError.badRequest('No file was uploaded.');
  }

  if (input.file.size === 0) throw ApiError.badRequest('That file is empty.');
  if (input.file.size > maxBytes) {
    throw new ApiError('PAYLOAD_TOO_LARGE', `Images must be ${MAX_UPLOAD_MB}MB or smaller.`);
  }

  const declaredType = (input.file.type || '').toLowerCase();
  const spec = ALLOWED[declaredType];
  if (!spec) {
    throw new ApiError(
      'UNSUPPORTED_MEDIA_TYPE',
      `Unsupported image type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}.`,
    );
  }

  const buffer = Buffer.from(await input.file.arrayBuffer());
  if (buffer.byteLength > maxBytes) {
    throw new ApiError('PAYLOAD_TOO_LARGE', `Images must be ${MAX_UPLOAD_MB}MB or smaller.`);
  }

  // The declared type is a hint from the client; the bytes are the truth.
  if (buffer.byteLength < 16 || !spec.matches(new Uint8Array(buffer.subarray(0, 16)))) {
    throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 'That file is not a valid image.');
  }

  const now = new Date();
  const folder = path.join(
    uploadRoot(),
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
  );
  await mkdir(folder, { recursive: true });

  // Random, server-generated name: the client never influences the path.
  const storageKey = path.posix.join(
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    `${randomBytes(16).toString('hex')}.${spec.ext}`,
  );

  await writeFile(path.join(uploadRoot(), storageKey), buffer, { mode: 0o640 });

  return prisma.uploadedFile.create({
    data: {
      ownerId: input.ownerId,
      storageKey,
      originalName: sanitiseName(input.file.name || `upload.${spec.ext}`),
      mimeType: declaredType,
      sizeBytes: buffer.byteLength,
      purpose: input.purpose,
      tournamentId: input.tournamentId ?? null,
      questionId: input.questionId ?? null,
    },
  });
}

function sanitiseName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, '_').slice(0, 180);
}

export interface FileViewer {
  id: string;
  role: 'ADMIN' | 'PARTICIPANT';
}

/**
 * Only the uploader, an admin, or the host of the related tournament may read a
 * file. Everyone else gets a 404 rather than a 403, so ids cannot be probed.
 */
export async function readFileForViewer(fileId: string, viewer: FileViewer) {
  const record = await prisma.uploadedFile.findUnique({ where: { id: fileId } });
  if (!record) throw ApiError.notFound('File not found.');

  let allowed = record.ownerId === viewer.id || viewer.role === 'ADMIN';

  if (!allowed && record.tournamentId) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: record.tournamentId },
      select: { hostId: true },
    });
    allowed = tournament?.hostId === viewer.id;
  }

  if (!allowed) {
    const usedInSubmission = await prisma.submission.findFirst({
      where: { uploadedFileId: fileId },
      select: { tournament: { select: { hostId: true } } },
    });
    allowed = usedInSubmission?.tournament.hostId === viewer.id;
  }

  if (!allowed) throw ApiError.notFound('File not found.');

  const absolute = path.join(uploadRoot(), record.storageKey);
  // Defence in depth: never read outside the upload root.
  if (!absolute.startsWith(uploadRoot())) throw ApiError.notFound('File not found.');

  const bytes = await readFile(absolute);
  return { record, bytes };
}

export function publicUrlFor(file: { id: string }): string {
  return `/api/files/${file.id}`;
}
