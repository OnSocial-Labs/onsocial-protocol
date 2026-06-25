import { cache } from 'react';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

export interface ProfileReputation {
  reputation: number;
  rank: number;
  socialScore: number;
  commitmentScore: number;
  qualityScore: number;
  consistencyScore: number;
  confidenceScore: number;
  totalPosts: number;
}

export interface ProfileSignals {
  /** Stand with them (incoming). */
  standingCount: number;
  /** They stand with (outgoing). */
  standingWithCount: number;
  /** Solidarity (mutual). */
  mutualStandingCount: number;
  endorsementsReceivedCount: number;
  endorsementsGivenCount: number;
  postCount: number;
  reputation: ProfileReputation | null;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

interface ReputationRow {
  reputation: string | number | null;
  rank: number | null;
  socialScore: string | number | null;
  commitmentScore: string | number | null;
  qualityScore: string | number | null;
  consistencyScore: string | number | null;
  confidenceScore: string | number | null;
  totalPosts: number | null;
}

async function fetchReputationRow(
  os: ReturnType<typeof createServerOnSocialClient>,
  accountId: string
): Promise<ProfileReputation | null> {
  try {
    const res = await os.query.graphql<{ reputationScores: ReputationRow[] }>({
      query: `query ProfileReputation($id: String!) {
        reputationScores(where: {accountId: {_eq: $id}}, limit: 1) {
          reputation rank socialScore commitmentScore qualityScore
          consistencyScore confidenceScore totalPosts
        }
      }`,
      variables: { id: accountId },
    });
    const row = res.data?.reputationScores?.[0];
    if (!row) {
      return null;
    }
    return {
      reputation: toNumber(row.reputation),
      rank: toNumber(row.rank),
      socialScore: toNumber(row.socialScore),
      commitmentScore: toNumber(row.commitmentScore),
      qualityScore: toNumber(row.qualityScore),
      consistencyScore: toNumber(row.consistencyScore),
      confidenceScore: toNumber(row.confidenceScore),
      totalPosts: toNumber(row.totalPosts),
    };
  } catch {
    return null;
  }
}

export const fetchProfileSignals = cache(
  async (accountId: string): Promise<ProfileSignals | null> => {
    try {
      const os = createServerOnSocialClient();
      const [row, reputation] = await Promise.all([
        os.query.profiles.lookup(accountId),
        fetchReputationRow(os, accountId),
      ]);

      if (!row && !reputation) {
        return null;
      }

      return {
        standingCount: toNumber(row?.standingCount),
        standingWithCount: toNumber(row?.standingWithCount),
        mutualStandingCount: toNumber(row?.mutualStandingCount),
        endorsementsReceivedCount: toNumber(row?.endorsementsReceivedCount),
        endorsementsGivenCount: toNumber(row?.endorsementsGivenCount),
        postCount: reputation?.totalPosts ?? 0,
        reputation,
      };
    } catch {
      return null;
    }
  }
);

export const fetchProfileReputation = cache(
  async (accountId: string): Promise<ProfileReputation | null> => {
    try {
      const os = createServerOnSocialClient();
      return await fetchReputationRow(os, accountId);
    } catch {
      return null;
    }
  }
);
