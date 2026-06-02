import { NextRequest, NextResponse } from 'next/server';
import type { MaterialisedProfile } from '@onsocial/sdk';
import { loadDiscoverIndexPage } from '@/lib/profile-discover-index';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ProfileDiscoverResult {
  accountId: string;
  profile: MaterialisedProfile | null;
  avatarUrl: string | null;
  standingCount: number;
  standingWithCount: number;
  mutualStandingCount: number;
  endorsementsReceivedCount: number;
  endorsementsGivenCount: number;
  firstProfileTimestamp: number | null;
  standingSince: number | null;
  standingBlockTimestamp: number | null;
  viewerStanding: boolean;
  theyStandWithViewer: boolean;
  targetEndorsedViewer: boolean;
}

interface ProfileDiscoverResponse {
  query: string;
  limit: number;
  offset: number;
  hasMore: boolean;
  results: ProfileDiscoverResult[];
}

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 24;
const MAX_OFFSET = 10_000;
const MAX_QUERY_LENGTH = 80;

function getQuery(request: NextRequest): string {
  return (request.nextUrl.searchParams.get('q') ?? '')
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

function getLimit(request: NextRequest): number {
  const rawLimit = Number(request.nextUrl.searchParams.get('limit'));
  if (!Number.isFinite(rawLimit) || rawLimit <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(rawLimit));
}

function getOffset(request: NextRequest): number {
  const rawOffset = Number(request.nextUrl.searchParams.get('offset'));
  if (!Number.isFinite(rawOffset) || rawOffset < 0) return 0;
  return Math.min(MAX_OFFSET, Math.floor(rawOffset));
}

function getViewerAccountId(request: NextRequest): string | null {
  return request.nextUrl.searchParams.get('viewerAccountId')?.trim() || null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Profile discovery failed';
}

export async function GET(request: NextRequest) {
  const query = getQuery(request);
  const limit = getLimit(request);
  const offset = getOffset(request);
  const viewerAccountId = getViewerAccountId(request);

  try {
    const os = createPortalServerOnSocialClient();
    const { profiles: profileRows, viewer } = await loadDiscoverIndexPage(
      query,
      limit,
      offset,
      viewerAccountId
    );

    const viewerOutgoingSet = new Set(
      viewer?.outgoing.map((row) => row.targetAccount) ?? []
    );
    const viewerOutgoingByTarget = new Map(
      viewer?.outgoing.map((row) => [row.targetAccount, row]) ?? []
    );
    const viewerIncomingSet = new Set(viewer?.incomingAccountIds ?? []);
    const viewerEndorsementIssuerSet = new Set(
      viewer?.endorsementIssuers ?? []
    );

    const results = profileRows.map((row) => {
      const profile: MaterialisedProfile = {
        accountId: row.accountId,
        name: row.name ?? undefined,
        bio: row.bio ?? undefined,
        avatar: row.avatar ?? undefined,
        banner: row.banner ?? undefined,
        lastUpdatedHeight: row.lastProfileBlock,
        lastUpdatedAt: row.lastProfileTimestamp,
        extra: {},
      };
      const viewerStandingRow = viewerOutgoingByTarget.get(row.accountId);
      return {
        accountId: row.accountId,
        profile,
        avatarUrl: os.profiles.avatarUrl(profile),
        standingCount: row.standingCount,
        standingWithCount: row.standingWithCount,
        mutualStandingCount: row.mutualStandingCount,
        endorsementsReceivedCount: row.endorsementsReceivedCount,
        endorsementsGivenCount: row.endorsementsGivenCount,
        firstProfileTimestamp: row.firstProfileTimestamp,
        standingSince: viewerStandingRow?.since ?? null,
        standingBlockTimestamp: viewerStandingRow?.blockTimestamp ?? null,
        viewerStanding: viewerOutgoingSet.has(row.accountId),
        theyStandWithViewer: viewerIncomingSet.has(row.accountId),
        targetEndorsedViewer: viewerEndorsementIssuerSet.has(row.accountId),
      } satisfies ProfileDiscoverResult;
    });

    const response: ProfileDiscoverResponse = {
      query,
      limit,
      offset,
      hasMore: profileRows.length === limit,
      results,
    };

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const detail = getErrorMessage(error);
    const missingKey =
      detail.includes('ONSOCIAL_API_KEY') ||
      detail.includes('OnAPI key is not configured');

    return NextResponse.json(
      {
        error: missingKey
          ? 'Portal OnAPI key is not configured'
          : 'Profile discovery failed',
        detail,
      },
      { status: missingKey ? 503 : 502 }
    );
  }
}
