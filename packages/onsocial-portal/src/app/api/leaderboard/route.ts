import { NextRequest, NextResponse } from 'next/server';
import { ACTIVE_API_URL } from '@/lib/portal-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HASURA_URL =
  process.env.HASURA_URL ??
  process.env.NEXT_PUBLIC_HASURA_URL ??
  `${ACTIVE_API_URL.replace(/\/$/, '')}/v1/graphql`;

const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET ?? '';

const MAX_LIMIT = 50;
const REVALIDATE_SECONDS = 30;

// ---------------------------------------------------------------------------
// Hasura uses graphql-default naming → snake_case columns become camelCase
// ---------------------------------------------------------------------------

type LeaderboardScope = 'influence' | 'reputation' | 'earners' | 'compact';

function buildQuery(scope: LeaderboardScope, limit: number): string {
  const safeLimit = Math.min(Math.max(1, limit), MAX_LIMIT);

  switch (scope) {
    case 'influence':
      return `{
        leaderboardBoost(
          orderBy: { rank: ASC }
          limit: ${safeLimit}
        ) {
          accountId
          lockedAmount
          effectiveBoost
          lockMonths
          totalClaimed
          totalCreditsPurchased
          lastEventBlock
          rank
        }
      }`;

    case 'reputation':
      return `{
        reputationScores(
          orderBy: { rank: ASC }
          limit: ${safeLimit}
        ) {
          accountId
          standingWith
          standingOut
          boost
          lockMonths
          rewardsEarned
          totalPosts
          replyCount
          reactionsReceived
          avgReactions
          activeDays
          uniqueConversations
          scarcesCreated
          scarcesSold
          scarcesRevenueNear
          socialScore
          commitmentScore
          qualityScore
          consistencyScore
          scarcesScore
          reputation
          rank
        }
      }`;

    case 'earners':
      return `{
        leaderboardRewards(
          orderBy: { rank: ASC }
          limit: ${safeLimit}
        ) {
          accountId
          totalEarned
          totalClaimed
          unclaimed
          creditCount
          lastCreditBlock
          lastClaimBlock
          rank
        }
      }`;

    case 'compact':
      return `{
        influence: leaderboardBoost(orderBy: { rank: ASC }, limit: 5) {
          accountId
          effectiveBoost
          lockMonths
          rank
        }
        reputation: reputationScores(orderBy: { rank: ASC }, limit: 5) {
          accountId
          reputation
          boost
          rewardsEarned
          totalPosts
          activeDays
          rank
        }
        earners: leaderboardRewards(orderBy: { rank: ASC }, limit: 5) {
          accountId
          totalEarned
          rank
        }
      }`;

    default:
      return `{ leaderboardBoost(limit: 1) { accountId } }`;
  }
}

export async function GET(request: NextRequest) {
  const scope = (request.nextUrl.searchParams.get('scope') ??
    'influence') as LeaderboardScope;
  const limit = Number.parseInt(
    request.nextUrl.searchParams.get('limit') ?? '20',
    10
  );

  const validScopes: LeaderboardScope[] = [
    'influence',
    'reputation',
    'earners',
    'compact',
  ];
  if (!validScopes.includes(scope)) {
    return NextResponse.json({ error: 'Invalid scope' }, { status: 400 });
  }

  const query = buildQuery(scope, limit);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (HASURA_ADMIN_SECRET) {
    headers['x-hasura-admin-secret'] = HASURA_ADMIN_SECRET;
  }

  try {
    const res = await fetch(HASURA_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
      cache: 'no-store',
    });

    const body = await res.json();

    if (body.errors) {
      return NextResponse.json(
        { error: 'Query failed', details: body.errors },
        { status: 502 }
      );
    }

    return NextResponse.json(body.data, {
      headers: {
        'Cache-Control': `public, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=${REVALIDATE_SECONDS * 2}`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Upstream unreachable' },
      { status: 502 }
    );
  }
}
