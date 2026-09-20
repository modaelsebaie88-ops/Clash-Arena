import { NextResponse } from 'next/server';
import { apiRoute } from '@/lib/api-helpers';
import { jsonOk } from '@/lib/http';
import { clearSessionCookie } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return apiRoute(request, async () => {
    const response = jsonOk({ ok: true });
    return clearSessionCookie(response as NextResponse);
  });
}
