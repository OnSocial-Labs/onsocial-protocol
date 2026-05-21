import { NextRequest, NextResponse } from 'next/server';
import type { MaterialisedProfile } from '@onsocial/sdk';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ProfileDiscoverResult {
  accountId: string;
  profile: MaterialisedProfile | null;
  avatarUrl: string | null;
  standingCount: number;
  standingWithCount: number;
}

interface ProfileDiscoverResponse {
  query: string;
  results: ProfileDiscoverResult[];
}

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Profile discovery failed';
}

export async function GET(request: NextRequest) {
  const query = getQuery(request);
  const limit = getLimit(request);

  try {
    const os = createPortalServerOnSocialClient();
    const profileRows = await os.query.profiles.search({ query, limit });
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
      return {
        accountId: row.accountId,
        profile,
        avatarUrl: os.profiles.avatarUrl(profile),
        standingCount: row.standingCount,
        standingWithCount: row.standingWithCount,
      } satisfies ProfileDiscoverResult;
    });

    const response: ProfileDiscoverResponse = { query, results };

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const detail = getErrorMessage(error);
    const missingKey = detail.includes('ONSOCIAL_API_KEY');

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
