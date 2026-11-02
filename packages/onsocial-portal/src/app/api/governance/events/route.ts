import { NextRequest } from 'next/server';
import { governanceBackendBase } from '@/lib/governance-proposal-backend';
import { resolveRequestDaoAccount } from '@/lib/portal-network-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const daoAccountId = await resolveRequestDaoAccount(
      request.nextUrl.searchParams.get('daoAccountId')
    );
    const url = new URL(
      `${await governanceBackendBase()}/v1/governance/events`
    );
    url.searchParams.set('daoAccountId', daoAccountId);

    const upstream = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: request.signal,
    });

    if (!upstream.ok || !upstream.body) {
      return new Response('Failed to connect governance event stream', {
        status: 502,
      });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'SSE proxy failed';
    return new Response(detail, {
      status: detail.includes('daoAccountId') ? 400 : 502,
    });
  }
}
