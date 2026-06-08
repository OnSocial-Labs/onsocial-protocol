import { NextRequest, NextResponse } from 'next/server';
import { GOVERNANCE_DAO_ACCOUNT } from '@/lib/portal-config';
import { loadDaoPolicy } from '@/lib/portal-governance-chain-server';
import {
  createPortalRequestCache,
  isRateLimitError,
} from '@/lib/portal-request-cache';
import type { GovernanceDaoPolicy } from '@/features/governance/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const POLICY_CACHE_TTL_MS = 30_000;
const policyCache = createPortalRequestCache<GovernanceDaoPolicy | null>(
  POLICY_CACHE_TTL_MS
);

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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'DAO policy query failed';
}

export async function GET(request: NextRequest) {
  try {
    const daoAccountId = readDaoAccountId(request);
    const policy = await policyCache.getOrLoad(daoAccountId, () =>
      loadDaoPolicy(daoAccountId)
    );

    return NextResponse.json(
      { policy },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        },
      }
    );
  } catch (error) {
    const detail = getErrorMessage(error);

    return NextResponse.json(
      {
        error: isRateLimitError(error)
          ? 'DAO policy lookup is busy — try again shortly'
          : detail.includes('Invalid daoAccountId')
            ? detail
            : 'DAO policy query failed',
        detail,
      },
      {
        status: isRateLimitError(error)
          ? 429
          : detail.includes('Invalid daoAccountId')
            ? 400
            : 502,
      }
    );
  }
}
