import { NextResponse } from 'next/server';
import { apiRoute } from '@/lib/api-helpers';
import { jsonCreated, parseBody, clientIp } from '@/lib/http';
import { attachSessionCookie, createSessionFor } from '@/lib/auth/session';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit';
import { registerSchema, registerUser, toSessionUserDTO } from '@/lib/services/user-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return apiRoute(request, async () => {
    await enforceRateLimit({
      bucket: 'auth:register',
      identity: clientIp(request),
      ...RATE_LIMITS.register,
      message: 'Too many sign-up attempts. Try again in a few minutes.',
    });

    const input = await parseBody(request, registerSchema);
    const user = await registerUser(input);
    const token = await createSessionFor(user);

    const response = jsonCreated({ user: toSessionUserDTO(user) });
    return attachSessionCookie(response as NextResponse, token);
  });
}
