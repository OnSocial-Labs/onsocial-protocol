import { NextRequest, NextResponse } from 'next/server';
import { ACTIVE_BACKEND_URL } from '@/lib/portal-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GOVERNANCE_BACKEND_URL = process.env.BACKEND_URL ?? ACTIVE_BACKEND_URL;
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'cache-control'] as const;

function buildTargetUrl(search: string): string {
  const trimmedBase = GOVERNANCE_BACKEND_URL.replace(/\/$/, '');
  return `${trimmedBase}/v1/governance/feed${search}`;
}

export async function GET(request: NextRequest) {
  const targetUrl = buildTargetUrl(request.nextUrl.search || '?scope=all');

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
