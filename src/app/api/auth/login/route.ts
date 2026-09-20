import { NextResponse } from 'next/server';
import { apiRoute } from '@/lib/api-helpers';
import { clientIp, jsonOk, parseBody } from '@/lib/http';
import { attachSessionCookie, createSessionFor } from '@/lib/auth/session';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit';
import { authenticate, loginSchema, toSessionUserDTO } from '@/lib/services/user-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return apiRoute(request, async () => {
    await enforceRateLimit({
      bucket: 'auth:login',
      identity: clientIp(request),
      ...RATE_LIMITS.login,
      message: 'Too many sign-in attempts. Wait a minute and try again.',
    });

    const input = await parseBody(request, loginSchema);
    const user = await authenticate(input);
    const token = await createSessionFor(user);

    const response = jsonOk({ user: toSessionUserDTO(user) });
    return attachSessionCookie(response as NextResponse, token);
  });
}
