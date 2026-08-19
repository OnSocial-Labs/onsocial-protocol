import { NextRequest, NextResponse } from 'next/server';
import { ACTIVE_BACKEND_URL } from '@/lib/app-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FORWARDED = ['content-type', 'cache-control'] as const;

export async function GET(request: NextRequest) {
  const target = `${ACTIVE_BACKEND_URL.replace(/\/$/, '')}/v1/governance/proposal-peeks${
    request.nextUrl.search || ''
  }`;
  try {
    const res = await fetch(target, { cache: 'no-store' });
    const body = await res.text();
    const headers = new Headers();
    for (const name of FORWARDED) {
      const value = res.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new NextResponse(body, { status: res.status, headers });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        error: 'Backend unreachable',
        upstream: target,
        detail,
      },
      { status: 502 }
    );
  }
}
