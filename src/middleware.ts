import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/tokens';

/**
 * Page-level access control.
 *
 * This is a UX guard that sends people to the right place; it is not the
 * security boundary. Every API route independently authenticates and authorises
 * its caller, so a forged cookie gets nothing even if it slipped past here.
 */

const AUTH_PAGES = ['/login', '/register'];
const AUTH_REQUIRED_PREFIXES = ['/dashboard', '/profile', '/history', '/join', '/admin'];
const LIVE_TOURNAMENT_PATH = /^\/tournaments\/[^/]+\/(play|waiting-room|result)/;

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? await verifySessionToken(token) : null;

  // Signed-in people never need the login screen.
  if (claims && AUTH_PAGES.includes(pathname)) {
    const target = claims.role === 'ADMIN' ? '/admin' : '/dashboard';
    return NextResponse.redirect(new URL(target, request.url));
  }

  const needsAuth =
    AUTH_REQUIRED_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    LIVE_TOURNAMENT_PATH.test(pathname);

  if (needsAuth && !claims) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith('/admin') && claims?.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/login',
    '/register',
    '/dashboard/:path*',
    '/profile/:path*',
    '/history/:path*',
    '/join/:path*',
    '/admin/:path*',
    '/tournaments/:path*',
  ],
};
