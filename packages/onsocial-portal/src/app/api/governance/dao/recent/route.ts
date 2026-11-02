import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestDaoAccount } from '@/lib/portal-network-request';
import { loadDaoRecentFromBackend } from '@/lib/governance-proposal-backend';
import {
  createPortalRequestCache,
  isRateLimitError,
} from '@/lib/portal-request-cache';
import type {
  GovernanceDaoPolicy,
  GovernanceDaoProposal,
} from '@/features/governance/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RECENT_CACHE_TTL_MS = 15_000;
const recentCache = createPortalRequestCache<{
  proposals: GovernanceDaoProposal[];
  daoPolicy: GovernanceDaoPolicy | null;
} | null>(RECENT_CACHE_TTL_MS);

function readLimit(request: NextRequest): number {
  const raw = request.nextUrl.searchParams.get('limit')?.trim();
  const parsed = Number.parseInt(raw ?? '20', 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 20;
  }
  return Math.min(parsed, 40);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'DAO recent proposals query failed';
}

export async function GET(request: NextRequest) {
  try {
    const daoAccountId = await resolveRequestDaoAccount(
      request.nextUrl.searchParams.get('daoAccountId')
    );
    const limit = readLimit(request);
    const cacheKey = `${daoAccountId}:${limit}`;
    const payload = await recentCache.getOrLoad(cacheKey, () =>
      loadDaoRecentFromBackend(daoAccountId, limit)
    );

    return NextResponse.json(
      {
        proposals: payload?.proposals ?? [],
        daoPolicy: payload?.daoPolicy ?? null,
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      }
    );
  } catch (error) {
    const detail = getErrorMessage(error);

    return NextResponse.json(
      {
        error: isRateLimitError(error)
          ? 'DAO recent proposals lookup is busy — try again shortly'
          : detail.includes('daoAccountId')
            ? detail
            : 'DAO recent proposals query failed',
        detail,
      },
      {
        status: isRateLimitError(error)
          ? 429
          : detail.includes('daoAccountId')
            ? 400
            : 502,
      }
    );
  }
}
