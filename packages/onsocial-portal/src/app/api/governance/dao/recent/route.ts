import { NextRequest, NextResponse } from 'next/server';
import { GOVERNANCE_DAO_ACCOUNT } from '@/lib/portal-config';
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
    const daoAccountId = readDaoAccountId(request);
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
          'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30',
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
