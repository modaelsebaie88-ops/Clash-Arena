import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import type { NextResponse } from 'next/server';
import type { Role, User } from '@prisma/client';
import { prisma } from '../db';
import { ApiError } from '../http';
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSessionToken,
  verifySessionToken,
  type SessionClaims,
} from './tokens';

const BCRYPT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSessionFor(user: Pick<User, 'id' | 'role' | 'username' | 'displayName'>) {
  return signSessionToken({
    sub: user.id,
    role: user.role as SessionClaims['role'],
    username: user.username,
    displayName: user.displayName,
  });
}

export function attachSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0));
  return response;
}

/** Claims only - cheap, no database round trip. */
export async function getSessionClaims(): Promise<SessionClaims | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export type SessionUser = Omit<User, 'passwordHash'>;

function stripSecrets(user: User): SessionUser {
  const { passwordHash: _ignored, ...safe } = user;
  return safe;
}

/** Full user record for the signed-in session, or null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const claims = await getSessionClaims();
  if (!claims) return null;
  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  return user ? stripSecrets(user) : null;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw ApiError.unauthorized();
  return user;
}

export async function requireRole(role: Role): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== role) throw ApiError.forbidden();
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  return requireRole('ADMIN');
}

/** Public projection - what other participants are allowed to see. */
export function publicUser(user: {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  };
}

export type PublicUser = ReturnType<typeof publicUser>;

export { stripSecrets };
