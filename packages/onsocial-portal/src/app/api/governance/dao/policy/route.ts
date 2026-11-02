import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestDaoAccount } from '@/lib/portal-network-request';
import { loadDaoPolicyFromBackend } from '@/lib/governance-proposal-backend';
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'DAO policy query failed';
}

export async function GET(request: NextRequest) {
  try {
    const daoAccountId = await resolveRequestDaoAccount(
      request.nextUrl.searchParams.get('daoAccountId')
    );
    const policy = await policyCache.getOrLoad(daoAccountId, () =>
      loadDaoPolicyFromBackend(daoAccountId)
    );

    return NextResponse.json(
      { policy },
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
