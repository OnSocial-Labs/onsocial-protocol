import { NextResponse, type NextRequest } from 'next/server';
import {
  COLLECTIBLES_ACCOUNT_HEADER,
  COLLECTIBLES_HELD_KINDS_COOKIE,
  COLLECTIBLES_HELD_KINDS_HEADER,
  COLLECTIBLES_SEARCH_HEADER,
  collectiblesVaultAccountFromPathname,
} from '@/lib/collectibles-held-kinds';

/**
 * Copy the Collectibles URL + last held-kinds cookie onto request headers so
 * `loading.tsx` can paint query chrome without a hydrate hop.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const account = collectiblesVaultAccountFromPathname(pathname);
  if (pathname !== '/collectibles' && pathname !== '/collectibles/' && !account) {
    return NextResponse.next();
  }

  const headers = new Headers(request.headers);
  headers.set(COLLECTIBLES_SEARCH_HEADER, search);
  if (account) {
    headers.set(COLLECTIBLES_ACCOUNT_HEADER, account);
    const held = request.cookies.get(COLLECTIBLES_HELD_KINDS_COOKIE)?.value;
    if (held) headers.set(COLLECTIBLES_HELD_KINDS_HEADER, held);
  }
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    '/collectibles',
    '/collectibles/',
    '/:accountId/collectibles',
    '/:accountId/collectibles/',
  ],
};
