import { gatewayQuery } from '@/lib/gateway-client';
import {
  REPUTATION_SCORES_GRAPHQL_FIELDS,
  type ReputationEntry,
} from '@/lib/leaderboard';

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
        ${REPUTATION_SCORES_GRAPHQL_FIELDS}
      }
    }`,
    { accountId }
  );

  return {
    accountId,
    reputation: data.reputationScores?.[0] ?? null,
  };
}
