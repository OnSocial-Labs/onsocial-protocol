import { NextRequest, NextResponse } from 'next/server';
import { gatewayQuery } from '@/lib/gateway-client';
import type { ReputationEntry } from '@/lib/leaderboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ProfileSignalsResponse {
  accountId: string;
  reputation: ReputationEntry | null;
}

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const REVALIDATE_SECONDS = 30;

function getAccountId(request: NextRequest): string | null {
  const accountId = request.nextUrl.searchParams.get('accountId')?.trim();
  if (!accountId) return null;
  if (!ACCOUNT_ID_PATTERN.test(accountId)) return null;
  return accountId;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Profile signals query failed';
}

export async function GET(request: NextRequest) {
  const accountId = getAccountId(request);
  if (!accountId) {
    return NextResponse.json(
      { error: 'A valid accountId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const data = await gatewayQuery<{ reputationScores: ReputationEntry[] }>(
      `query ProfileSignals($accountId: String!) {
        reputationScores(
          where: { accountId: { _eq: $accountId } }
          limit: 1
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
      }`,
      { accountId }
    );

    const response: ProfileSignalsResponse = {
      accountId,
      reputation: data.reputationScores?.[0] ?? null,
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': `public, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=${REVALIDATE_SECONDS * 2}`,
      },
    });
  } catch (error) {
    const detail = getErrorMessage(error);
    return NextResponse.json(
      {
        error: 'Profile signals query failed',
        detail,
      },
      { status: 502 }
    );
  }
}
