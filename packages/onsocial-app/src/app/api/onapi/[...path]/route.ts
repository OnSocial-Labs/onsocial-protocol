import { NextRequest, NextResponse } from 'next/server';
import { ACTIVE_API_URL } from '@/lib/app-config';
import { getServerApiKey } from '@/lib/create-server-onsocial-client';
import {
  E2E_GRAPH_COOKIE,
  e2eGraphStubsAllowed,
  extractGraphRequest,
  resolveE2eGraphStub,
} from '@/lib/e2e-graph-stubs';
import { isOnApiSameOriginRequest } from '@/lib/onapi-proxy-origin';
import {
  SCARCES_TOKEN_GATEWAY_TIMEOUT_MS,
  isScarcesTokenGatewayTimeout,
  isScarcesTokenRead,
  noteScarcesTokenGatewayFailure,
  noteScarcesTokenGatewaySuccess,
  readScarcesTokenFallback,
  scarcesTokenGatewayCoolingOff,
  shouldFallbackScarcesTokenGateway,
  type ScarcesTokenFallbackResult,
} from '@/server/scarces-token-fallback';
import {
  ALLOWED_PROXY_ROUTES,
  type AllowedProxyRoute,
  type ProxyBodyKind,
} from '../allowed-proxy-routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
      (route) => route.method === method && pathMatchesAllowed(route.path, path)
    ) ?? null
  );
}

function buildTargetUrl(pathSegments: string[], search: string): string {
  const base = ACTIVE_API_URL.replace(/\/$/, '');
  const path = pathSegments.map(encodeURIComponent).join('/');
  return `${base}/${path}${search}`;
}

function isSameOriginRequest(request: NextRequest): boolean {
  return isOnApiSameOriginRequest({
    origin: request.headers.get('origin'),
    nextOrigin: request.nextUrl.origin,
    host: request.headers.get('host'),
    forwardedHost: request.headers.get('x-forwarded-host'),
    forwardedProto: request.headers.get('x-forwarded-proto'),
    protocol: request.nextUrl.protocol,
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown upstream error';
}

function upstreamResponse(
  status: number,
  body: string,
  upstreamHeaders: { get(name: string): string | null }
): NextResponse {
  const responseHeaders = new Headers({ 'Cache-Control': 'no-store' });
  for (const headerName of FORWARDED_RESPONSE_HEADERS) {
    const value = upstreamHeaders.get(headerName);
    if (value) responseHeaders.set(headerName, value);
  }
  return new NextResponse(body, {
    status,
    headers: responseHeaders,
  });
}

function scarcesTokenFallbackResponse(
  result: ScarcesTokenFallbackResult,
  upstreamHeaders?: Headers
): NextResponse {
  if (result.kind === 'upstream') {
    const headers = upstreamHeaders ?? new Headers();
    if (!headers.get('content-type') && result.contentType) {
      headers.set('content-type', result.contentType);
    }
    return upstreamResponse(result.status, result.body, headers);
  }
  return new NextResponse(result.body, {
    status: result.status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
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

  if (
    e2eGraphStubsAllowed() &&
    request.method === 'POST' &&
    pathSegments.join('/') === 'graph/query'
  ) {
    const cookieValue = request.cookies.get(E2E_GRAPH_COOKIE)?.value;
    if (cookieValue) {
      const { query, variables } = extractGraphRequest(
        await request.clone().text()
      );
      const stub = resolveE2eGraphStub({
        query,
        variables,
        cookieValue,
      });
      if (stub) {
        return NextResponse.json(stub, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
    }
  }

  const route = findAllowedRoute(request.method, pathSegments);
  if (!route) {
    return NextResponse.json(
      { error: 'OnAPI proxy route is not allowed' },
      { status: 404 }
    );
  }

  const apiKey = getServerApiKey();
  if (!apiKey && !route.optionalApiKey && !route.forwardAuthorization) {
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
  } else if (apiKey) {
    headers.set('X-API-Key', apiKey);
  }

  if (route.body === 'json') {
    headers.set(
      'Content-Type',
      request.headers.get('content-type') ?? 'application/json'
    );
  }

  const targetUrl = buildTargetUrl(pathSegments, request.nextUrl.search);
  const scarcesTokenRead = isScarcesTokenRead(request.method, pathSegments);
  const scarcesTokenId = scarcesTokenRead
    ? (request.nextUrl.searchParams.get('tokenId')?.trim() ?? '')
    : '';
  const scarcesTokenFallback = scarcesTokenRead && scarcesTokenId.length > 0;

  if (scarcesTokenFallback && scarcesTokenGatewayCoolingOff()) {
    const result = await readScarcesTokenFallback({
      tokenId: scarcesTokenId,
      reason: 'cool_off',
    });
    return scarcesTokenFallbackResponse(result);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: 'no-store',
  };
  if (scarcesTokenRead) {
    init.signal = AbortSignal.timeout(SCARCES_TOKEN_GATEWAY_TIMEOUT_MS);
  }

  const body = await getForwardedBody(request, route.body);
  if (body) init.body = body;

  try {
    const response = await fetch(targetUrl, init);
    const responseBody = await response.text();
    if (
      scarcesTokenFallback &&
      shouldFallbackScarcesTokenGateway(response.status, responseBody)
    ) {
      noteScarcesTokenGatewayFailure();
      const result = await readScarcesTokenFallback({
        tokenId: scarcesTokenId,
        reason: 'http',
        upstream: {
          status: response.status,
          body: responseBody,
          contentType: response.headers.get('content-type'),
        },
      });
      return scarcesTokenFallbackResponse(result, response.headers);
    }
    if (scarcesTokenRead && response.ok) {
      noteScarcesTokenGatewaySuccess();
    }
    return upstreamResponse(response.status, responseBody, response.headers);
  } catch (error) {
    if (scarcesTokenFallback) {
      noteScarcesTokenGatewayFailure();
      const result = await readScarcesTokenFallback({
        tokenId: scarcesTokenId,
        reason: isScarcesTokenGatewayTimeout(error) ? 'timeout' : 'network',
      });
      return scarcesTokenFallbackResponse(result);
    }
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
