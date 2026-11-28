import { NextRequest, NextResponse } from 'next/server';
import { getRequestBackendUrl } from '@/lib/portal-network-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FORWARDED_RESPONSE_HEADERS = ['content-type', 'cache-control'] as const;

export async function GET(request: NextRequest) {
  const trimmedBase = await getRequestBackendUrl();
  const targetUrl = `${trimmedBase}/v1/governance/feed${request.nextUrl.search || '?scope=all'}`;

  try {
    const res = await fetch(targetUrl, { cache: 'no-store' });
    const body = await res.text();
    const headers = new Headers();

    for (const headerName of FORWARDED_RESPONSE_HEADERS) {
      const value = res.headers.get(headerName);
      if (value) {
        headers.set(headerName, value);
      }
    }

    return new NextResponse(body, {
      status: res.status,
      headers,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown upstream error';

    return new NextResponse(
      JSON.stringify({
        success: false,
        error: 'Backend unreachable',
        upstream: targetUrl,
        detail: message,
      }),
      {
        status: 502,
        headers: { 'content-type': 'application/json' },
      }
    );
  }
}
