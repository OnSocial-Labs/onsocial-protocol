import { NextRequest } from 'next/server';
import {
  ACTIVE_BACKEND_URL,
  GOVERNANCE_DAO_ACCOUNT,
} from '@/lib/portal-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL ?? ACTIVE_BACKEND_URL;
const DAO_ACCOUNT_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function readDaoAccountId(request: NextRequest): string {
  const daoAccountId =
    request.nextUrl.searchParams.get('daoAccountId')?.trim() ||
    GOVERNANCE_DAO_ACCOUNT;
  if (!DAO_ACCOUNT_PATTERN.test(daoAccountId)) {
    throw new Error('Invalid daoAccountId');
  }
  return daoAccountId;
}

export async function GET(request: NextRequest) {
  try {
    const daoAccountId = readDaoAccountId(request);
    const url = new URL(
      `${BACKEND_URL.replace(/\/$/, '')}/v1/governance/events`
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
