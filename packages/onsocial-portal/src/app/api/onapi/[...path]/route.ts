import { NextRequest, NextResponse } from 'next/server';
import { ACTIVE_API_URL } from '@/lib/portal-config';
import { getServerOnApiKey } from '@/lib/onsocial-server-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ProxyBodyKind = 'none' | 'json' | 'form';

interface AllowedProxyRoute {
  method: 'GET' | 'POST';
  path: string;
  body: ProxyBodyKind;
}

const ALLOWED_PROXY_ROUTES: AllowedProxyRoute[] = [
  { method: 'POST', path: 'storage/upload', body: 'form' },
  { method: 'POST', path: 'compose/prepare/set', body: 'json' },
  { method: 'GET', path: 'relay/latest-block', body: 'none' },
  { method: 'POST', path: 'relay/delegate', body: 'json' },
];

const FORWARDED_RESPONSE_HEADERS = ['content-type', 'cache-control'] as const;

function findAllowedRoute(
  method: string,
  pathSegments: string[]
): AllowedProxyRoute | null {
  const path = pathSegments.join('/');
  return (
    ALLOWED_PROXY_ROUTES.find(
      (route) => route.method === method && route.path === path
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

  const apiKey = getServerOnApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Portal OnAPI key is not configured' },
      { status: 503 }
    );
  }

  const headers = new Headers({ 'X-API-Key': apiKey });
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
        error: 'OnAPI gateway unreachable',
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

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: 'GET, POST, OPTIONS',
    },
  });
}
