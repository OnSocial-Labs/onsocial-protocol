import { NextRequest, NextResponse } from 'next/server';
import { enrichDaoProposalWithResolvedAt } from '@/features/governance/governance-proposal-resolved-at.server';
import { GOVERNANCE_DAO_ACCOUNT } from '@/lib/portal-config';
import { loadDaoProposalFromBackend } from '@/lib/governance-proposal-backend';
import {
  createPortalRequestCache,
  isRateLimitError,
} from '@/lib/portal-request-cache';
import type { GovernanceDaoProposal } from '@/features/governance/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROPOSAL_CACHE_TTL_MS = 15_000;
const proposalCache = createPortalRequestCache<GovernanceDaoProposal | null>(
  PROPOSAL_CACHE_TTL_MS
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

function readLiveFlag(request: NextRequest): boolean {
  const raw = request.nextUrl.searchParams.get('live')?.trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function readProposalId(request: NextRequest): number {
  const raw = request.nextUrl.searchParams.get('proposalId')?.trim();
  const proposalId = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(proposalId) || proposalId < 0) {
    throw new Error('A valid proposalId query parameter is required');
  }
  return proposalId;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'DAO proposal query failed';
}

export async function GET(request: NextRequest) {
  try {
    const daoAccountId = readDaoAccountId(request);
    const proposalId = readProposalId(request);
    const cacheKey = `${daoAccountId}:${proposalId}`;
    const live = readLiveFlag(request);
    const loadedProposal = live
      ? await loadDaoProposalFromBackend(proposalId, daoAccountId, {
          live: true,
        })
      : await proposalCache.getOrLoad(cacheKey, () =>
          loadDaoProposalFromBackend(proposalId, daoAccountId)
        );
    const proposal = await enrichDaoProposalWithResolvedAt(
      loadedProposal,
      daoAccountId
    );

    return NextResponse.json(
      { proposal },
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
          ? 'DAO proposal lookup is busy — try again shortly'
          : detail.includes('proposalId') || detail.includes('daoAccountId')
            ? detail
            : 'DAO proposal query failed',
        detail,
      },
      {
        status: isRateLimitError(error)
          ? 429
          : detail.includes('proposalId') || detail.includes('daoAccountId')
            ? 400
            : 502,
      }
    );
  }
}
