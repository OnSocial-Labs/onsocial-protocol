import { NextRequest, NextResponse } from 'next/server';
import { ACTIVE_BACKEND_URL } from '@/lib/portal-config';

export const runtime = 'nodejs';

const PARTNER_BACKEND_URL = process.env.BACKEND_URL ?? ACTIVE_BACKEND_URL;
const FORWARDED_REQUEST_HEADERS = ['content-type', 'x-api-key'] as const;
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'cache-control'] as const;

function buildTargetUrl(pathSegments: string[], search: string): string {
  const trimmedBase = PARTNER_BACKEND_URL.replace(/\/$/, '');
  const encodedPath = pathSegments.map(encodeURIComponent).join('/');
  return `${trimmedBase}/v1/partners/${encodedPath}${search}`;
}

async function proxyPartnerRequest(
  request: NextRequest,
  pathSegments: string[]
): Promise<NextResponse> {
  const targetUrl = buildTargetUrl(pathSegments, request.nextUrl.search);
  const headers = new Headers();

  for (const headerName of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(headerName);
    if (value) {
      headers.set(headerName, value);
    }
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: 'no-store',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const body = await request.text();
    if (body) {
      init.body = body;
    }
  }

  try {
    const response = await fetch(targetUrl, init);
    const responseBody = await response.text();
    const responseHeaders = new Headers();

    for (const headerName of FORWARDED_RESPONSE_HEADERS) {
      const value = response.headers.get(headerName);
      if (value) {
        responseHeaders.set(headerName, value);
      }
    }

    return new NextResponse(responseBody, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown upstream error';

    return NextResponse.json(
      {
        success: false,
        error: 'Backend unreachable',
        upstream: targetUrl,
        detail: message,
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
  return proxyPartnerRequest(request, path);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  return proxyPartnerRequest(request, path);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: 'GET, POST, OPTIONS',
    },
  });
}
