import { NextRequest, NextResponse } from 'next/server';
import { ACTIVE_API_URL } from '@/lib/app-config';
import { getServerApiKey } from '@/lib/create-server-onsocial-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ProxyBodyKind = 'none' | 'json' | 'form';

interface AllowedProxyRoute {
  method: 'GET' | 'POST' | 'DELETE';
  /**
   * Exact path, or a single-segment wildcard with a trailing `/*`
   * (e.g. `compose/generate/variation-set/*` → `…/variation-set/<jobId>`).
   */
  path: string;
  body: ProxyBodyKind;
  /**
   * Forward the browser `Authorization` bearer (viewer JWT) and skip the
   * server API key. Required for private prefs like mutes.
   */
  forwardAuthorization?: boolean;
}

const ALLOWED_PROXY_ROUTES: AllowedProxyRoute[] = [
  { method: 'POST', path: 'storage/upload', body: 'form' },
  { method: 'POST', path: 'compose/prepare/set', body: 'json' },
  { method: 'GET', path: 'relay/latest-block', body: 'none' },
  { method: 'POST', path: 'relay/delegate', body: 'json' },
  { method: 'GET', path: 'data/get-one', body: 'none' },
  { method: 'GET', path: 'data/get', body: 'none' },
  // Live guild page reads.
  { method: 'GET', path: 'data/group-config', body: 'none' },
  { method: 'GET', path: 'data/group-stats', body: 'none' },
  { method: 'GET', path: 'data/group-is-member', body: 'none' },
  { method: 'GET', path: 'data/group-is-owner', body: 'none' },
  { method: 'GET', path: 'data/group-join-request', body: 'none' },
  { method: 'GET', path: 'data/proposals', body: 'none' },
  { method: 'GET', path: 'data/proposal', body: 'none' },
  { method: 'GET', path: 'data/proposal-tally', body: 'none' },
  { method: 'GET', path: 'data/vote', body: 'none' },
  { method: 'GET', path: 'data/proposal-count', body: 'none' },
  { method: 'GET', path: 'data/has-group-admin', body: 'none' },
  { method: 'GET', path: 'data/has-group-moderate', body: 'none' },
  // Allowlist room writer checks (`os.permissions.has` / space WRITE grants).
  { method: 'GET', path: 'data/has-permission', body: 'none' },
  { method: 'GET', path: 'data/permissions', body: 'none' },

  // SOCIAL wallet balance — premium mood unlock preflight.
  { method: 'GET', path: 'data/ft-balance-of', body: 'none' },
  // Boost position reads (portfolio boost sheet).
  { method: 'GET', path: 'data/boost-account', body: 'none' },
  { method: 'GET', path: 'data/boost-lock-status', body: 'none' },
  { method: 'GET', path: 'data/boost-rewards-live', body: 'none' },
  // SOCIAL token icon / decimals for amount fields.
  { method: 'GET', path: 'data/ft-metadata', body: 'none' },
  // Wallet storage buffer + personal storage reads.
  { method: 'GET', path: 'data/storage-balance', body: 'none' },
  { method: 'GET', path: 'data/platform-allowance', body: 'none' },
  { method: 'GET', path: 'data/shared-pool', body: 'none' },
  // Indexed reads after profile save (`os.profiles.get`) and other SDK queries.
  { method: 'POST', path: 'graph/query', body: 'json' },

  // Scarces — list / buy / cancel (lazy + fixed-price + native resale).
  { method: 'POST', path: 'compose/prepare/lazy-list', body: 'form' },
  { method: 'POST', path: 'compose/preview/text-card', body: 'json' },
  { method: 'POST', path: 'compose/prepare/purchase-lazy-list', body: 'json' },
  {
    method: 'POST',
    path: 'compose/prepare/purchase-native-scarce',
    body: 'json',
  },
  { method: 'POST', path: 'compose/prepare/cancel-lazy-list', body: 'json' },
  {
    method: 'POST',
    path: 'compose/prepare/list-native-scarce',
    body: 'json',
  },
  {
    method: 'POST',
    path: 'compose/prepare/delist-native-scarce',
    body: 'json',
  },

  // Scarces — auctions (Market Sell / Bid / cancel / settle).
  { method: 'POST', path: 'compose/prepare/list-auction', body: 'json' },
  { method: 'POST', path: 'compose/prepare/place-bid', body: 'json' },
  { method: 'POST', path: 'compose/prepare/settle-auction', body: 'json' },
  { method: 'POST', path: 'compose/prepare/cancel-auction', body: 'json' },

  // Scarces — token offers (Make offer / cancel / accept).
  { method: 'POST', path: 'compose/prepare/make-offer', body: 'json' },
  { method: 'POST', path: 'compose/prepare/cancel-offer', body: 'json' },
  { method: 'POST', path: 'compose/prepare/accept-offer', body: 'json' },

  // Scarces — create drop (single / music / variation / generative).
  {
    method: 'POST',
    path: 'compose/prepare/create-collection',
    body: 'form',
  },
  { method: 'POST', path: 'compose/upload/variation-set', body: 'form' },
  { method: 'POST', path: 'compose/generate/variation-set', body: 'form' },
  {
    method: 'GET',
    path: 'compose/generate/variation-set/*',
    body: 'none',
  },
  // Scarces — primary mint from a collection page + allowlist edits.
  {
    method: 'POST',
    path: 'compose/prepare/purchase-from-collection',
    body: 'json',
  },
  { method: 'POST', path: 'compose/prepare/set-allowlist', body: 'json' },
  // Scarces — creator pause / resume / delete (empty only).
  { method: 'POST', path: 'compose/prepare/pause-collection', body: 'json' },
  { method: 'POST', path: 'compose/prepare/resume-collection', body: 'json' },
  { method: 'POST', path: 'compose/prepare/delete-collection', body: 'json' },

  // Hubs (apps) — register / config / creators / ownership.
  { method: 'POST', path: 'compose/prepare/register-app', body: 'json' },
  { method: 'POST', path: 'compose/prepare/set-app-config', body: 'json' },
  {
    method: 'POST',
    path: 'compose/prepare/transfer-app-ownership',
    body: 'json',
  },
  {
    method: 'POST',
    path: 'compose/prepare/add-approved-creator',
    body: 'json',
  },
  {
    method: 'POST',
    path: 'compose/prepare/add-approved-creators',
    body: 'json',
  },
  {
    method: 'POST',
    path: 'compose/prepare/remove-approved-creator',
    body: 'json',
  },

  // Gateway wallet auth (NEP-413) — used to obtain a viewer JWT for mutes.
  { method: 'POST', path: 'auth/challenge', body: 'json' },
  { method: 'POST', path: 'auth/login', body: 'json' },

  // Private mute prefs (viewer JWT — not the server API key).
  {
    method: 'GET',
    path: 'developer/mutes',
    body: 'none',
    forwardAuthorization: true,
  },
  {
    method: 'POST',
    path: 'developer/mutes',
    body: 'json',
    forwardAuthorization: true,
  },
  {
    method: 'DELETE',
    path: 'developer/mutes/*',
    body: 'none',
    forwardAuthorization: true,
  },
];

const FORWARDED_RESPONSE_HEADERS = ['content-type', 'cache-control'] as const;

function pathMatchesAllowed(routePath: string, path: string): boolean {
  if (routePath.endsWith('/*')) {
    const prefix = routePath.slice(0, -2);
    if (!path.startsWith(`${prefix}/`)) return false;
    // Exactly one wildcard segment (job id, etc.).
    return path.slice(prefix.length + 1).split('/').length === 1;
  }
  return routePath === path;
}

function findAllowedRoute(
  method: string,
  pathSegments: string[]
): AllowedProxyRoute | null {
  const path = pathSegments.join('/');
  return (
    ALLOWED_PROXY_ROUTES.find(
      (route) =>
        route.method === method && pathMatchesAllowed(route.path, path)
    ) ?? null
  );
}

function buildTargetUrl(pathSegments: string[], search: string): string {
  const base = ACTIVE_API_URL.replace(/\/$/, '');
  const path = pathSegments.map(encodeURIComponent).join('/');
  return `${base}/${path}${search}`;
}

function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  return !origin || origin === request.nextUrl.origin;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown upstream error';
}

async function getForwardedBody(
  request: NextRequest,
  bodyKind: ProxyBodyKind
): Promise<BodyInit | undefined> {
  if (bodyKind === 'none') return undefined;
  if (bodyKind === 'form') return request.formData();

  const body = await request.text();
  return body.length > 0 ? body : undefined;
}

async function proxyOnApiRequest(
  request: NextRequest,
  pathSegments: string[]
): Promise<NextResponse> {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: 'Cross-origin OnAPI proxy requests are not allowed' },
      { status: 403 }
    );
  }

  const route = findAllowedRoute(request.method, pathSegments);
  if (!route) {
    return NextResponse.json(
      { error: 'OnAPI proxy route is not allowed' },
      { status: 404 }
    );
  }

  const apiKey = getServerApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ONSOCIAL_API_KEY is not configured for this app' },
      { status: 503 }
    );
  }

  const headers = new Headers();
  if (route.forwardAuthorization) {
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    headers.set('Authorization', authorization);
  } else {
    headers.set('X-API-Key', apiKey);
  }

  if (route.body === 'json') {
    headers.set(
      'Content-Type',
      request.headers.get('content-type') ?? 'application/json'
    );
  }

  const targetUrl = buildTargetUrl(pathSegments, request.nextUrl.search);
  const init: RequestInit = {
    method: request.method,
    headers,
    cache: 'no-store',
  };

  const body = await getForwardedBody(request, route.body);
  if (body) init.body = body;

  try {
    const response = await fetch(targetUrl, init);
    const responseBody = await response.text();
    const responseHeaders = new Headers({ 'Cache-Control': 'no-store' });

    for (const headerName of FORWARDED_RESPONSE_HEADERS) {
      const value = response.headers.get(headerName);
      if (value) responseHeaders.set(headerName, value);
    }

    return new NextResponse(responseBody, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'OnSocial gateway unreachable',
        detail: getErrorMessage(error),
      },
      { status: 502 }
    );
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  return proxyOnApiRequest(request, path);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  return proxyOnApiRequest(request, path);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  return proxyOnApiRequest(request, path);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: 'GET, POST, DELETE, OPTIONS',
    },
  });
}
