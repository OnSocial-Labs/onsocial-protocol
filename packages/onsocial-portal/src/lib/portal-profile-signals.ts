import { gatewayQuery } from '@/lib/gateway-client';
import type { ReputationEntry } from '@/lib/leaderboard';

export interface PortalProfileSignalsPayload {
  accountId: string;
  reputation: ReputationEntry | null;
}

export async function loadPortalProfileSignals(
  accountId: string
): Promise<PortalProfileSignalsPayload> {
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

  return {
    accountId,
    reputation: data.reputationScores?.[0] ?? null,
  };
}
