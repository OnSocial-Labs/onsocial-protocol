import { NextResponse, type NextRequest } from 'next/server';

import {
  PORTAL_NETWORK_COOKIE,
  portalNetworkProfile,
  resolvePortalNetwork,
  socialHandoffDestination,
} from '@/lib/portal-network';

export function middleware(request: NextRequest) {
  const network = resolvePortalNetwork(
    request.cookies.get(PORTAL_NETWORK_COOKIE)?.value
  );
  const destination = socialHandoffDestination(
    request.nextUrl.pathname,
    portalNetworkProfile(network).appUrl
  );
  if (!destination) return NextResponse.next();
  return NextResponse.redirect(destination, 307);
}

export const config = {
  matcher: [
    '/discover',
    '/boost',
    '/boost/leaderboard',
    '/season',
    '/season-zero',
    '/u/:path*',
  ],
};
