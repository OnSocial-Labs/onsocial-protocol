import { cache } from 'react';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

export interface ProfileReputation {
  reputation: number;
  rank: number;
  socialScore: number;
  commitmentScore: number;
  qualityScore: number;
  consistencyScore: number;
  scarcesScore: number;
  confidenceScore: number;
  totalPosts: number;
  paidSupportSpenders: number;
  uniqueInboundPeers: number;
  uniqueScarceFans: number;
  amplifyEvents: number;
  lockMonths: number;
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

/** True when the face signals row has something worth showing (hide all-zero dormant). */
export function profileSignalsHaveFaceMetrics(
  signals: ProfileSignals,
  options?: { isDao?: boolean }
): boolean {
  if (options?.isDao) {
    return (
      signals.standingCount > 0 ||
      signals.standingWithCount > 0 ||
      signals.mutualStandingCount > 0
    );
  }

  return (
    signals.standingCount > 0 ||
    signals.standingWithCount > 0 ||
    signals.mutualStandingCount > 0 ||
    signals.endorsementsReceivedCount > 0 ||
    signals.endorsementsGivenCount > 0 ||
    Boolean(signals.reputation && signals.reputation.reputation > 0)
  );
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
  scarcesScore: string | number | null;
  confidenceScore: string | number | null;
  totalPosts: number | null;
  paidSupportSpenders: number | null;
  uniqueInboundPeers: number | null;
  uniqueScarceFans: number | null;
  amplifyEvents: number | null;
  lockMonths: number | null;
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
          consistencyScore scarcesScore confidenceScore totalPosts
          paidSupportSpenders uniqueInboundPeers uniqueScarceFans
          amplifyEvents lockMonths
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
      scarcesScore: toNumber(row.scarcesScore),
      confidenceScore: toNumber(row.confidenceScore),
      totalPosts: toNumber(row.totalPosts),
      paidSupportSpenders: toNumber(row.paidSupportSpenders),
      uniqueInboundPeers: toNumber(row.uniqueInboundPeers),
      uniqueScarceFans: toNumber(row.uniqueScarceFans),
      amplifyEvents: toNumber(row.amplifyEvents),
      lockMonths: toNumber(row.lockMonths),
    };
  } catch {
    return null;
  }
}

export const fetchProfileSignals = cache(
  async (accountId: string): Promise<ProfileSignals | null> => {
    try {
      const os = createServerOnSocialClient();
      const [row, reputation, standingCounts] = await Promise.all([
        os.query.profiles.lookup(accountId),
        fetchReputationRow(os, accountId),
        os.query.standings.counts(accountId),
      ]);

      const hasStandingActivity =
        standingCounts.incoming > 0 || standingCounts.outgoing > 0;

      if (!row && !reputation && !hasStandingActivity) {
        return null;
      }

      const mutualStandingCount = row
        ? toNumber(row.mutualStandingCount)
        : await os.query.standings.mutualCount(accountId);

      return {
        standingCount: row
          ? toNumber(row.standingCount)
          : standingCounts.incoming,
        standingWithCount: row
          ? toNumber(row.standingWithCount)
          : standingCounts.outgoing,
        mutualStandingCount,
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
