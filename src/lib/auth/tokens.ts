import { SignJWT, jwtVerify } from 'jose';

/**
 * Edge-safe half of authentication: JWT signing/verification and cookie shape.
 * Deliberately free of Prisma and bcrypt so Next.js middleware can import it.
 */

export const SESSION_COOKIE = 'clash_session';

export type SessionRole = 'ADMIN' | 'PARTICIPANT';

export interface SessionClaims {
  sub: string;
  role: SessionRole;
  username: string;
  displayName: string;
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET is missing or too short (needs 32+ characters).');
  }
  return new TextEncoder().encode(secret);
}

function ttlHours(): number {
  const raw = Number(process.env.AUTH_SESSION_TTL_HOURS ?? 72);
  return Number.isFinite(raw) && raw > 0 ? raw : 72;
}

export function sessionMaxAgeSeconds(): number {
  return Math.floor(ttlHours() * 3600);
}

export async function signSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({
    role: claims.role,
    username: claims.username,
    displayName: claims.displayName,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer('clash-arena')
    .setAudience('clash-arena-app')
    .setExpirationTime(`${ttlHours()}h`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: 'clash-arena',
      audience: 'clash-arena-app',
    });
    if (!payload.sub || typeof payload.role !== 'string') return null;
    return {
      sub: payload.sub,
      role: payload.role as SessionRole,
      username: String(payload.username ?? ''),
      displayName: String(payload.displayName ?? ''),
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAge = sessionMaxAgeSeconds()) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

/** Minimal cookie-header parser for the websocket handshake. */
export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (rawKey === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}
