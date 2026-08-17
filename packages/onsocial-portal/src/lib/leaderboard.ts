import { yoctoToNear, yoctoToSocial } from '@/lib/near-rpc';
import {
  LEADERBOARD_PAGE_SIZE,
  REPUTATION_SCORES_GRAPHQL_FIELDS,
  commitmentAccent,
  commitmentLabel,
  formatReputation,
  formatScore,
  pctOfLeader,
  reputationConfidenceLabel,
  reputationTier,
  truncateAccountId,
  type EarnerEntry,
  type InfluenceEntry,
  type ReputationEntry,
} from '@onsocial/sdk';

export type { EarnerEntry, InfluenceEntry, ReputationEntry };
export {
  LEADERBOARD_PAGE_SIZE,
  REPUTATION_SCORES_GRAPHQL_FIELDS,
  commitmentAccent,
  commitmentLabel,
  formatReputation,
  formatScore,
  pctOfLeader,
  reputationConfidenceLabel,
  reputationTier,
  truncateAccountId,
};

/** Homepage compact preview */
export interface CompactLeaderboard {
  influence: Pick<
    InfluenceEntry,
    'accountId' | 'effectiveBoost' | 'lockMonths' | 'rank'
  >[];
  reputation: Pick<
    ReputationEntry,
    | 'accountId'
    | 'reputation'
    | 'boost'
    | 'rewardsEarned'
    | 'totalPosts'
    | 'activeDays'
    | 'rank'
  >[];
  earners: Pick<EarnerEntry, 'accountId' | 'totalEarned' | 'rank'>[];
}

async function fetchLeaderboard<T>(
  scope: string,
  limit?: number
): Promise<T | null> {
  const params = new URLSearchParams({ scope });
  if (limit != null) params.set('limit', String(limit));

  try {
    const res = await fetch(`/api/leaderboard?${params.toString()}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function fetchInfluenceBoard(
  limit = LEADERBOARD_PAGE_SIZE
): Promise<{ leaderboardBoost: InfluenceEntry[] } | null> {
  return fetchLeaderboard('influence', limit);
}

export function fetchReputationBoard(
  limit = LEADERBOARD_PAGE_SIZE
): Promise<{ reputationScores: ReputationEntry[] } | null> {
  return fetchLeaderboard('reputation', limit);
}

export function fetchEarnerBoard(
  limit = LEADERBOARD_PAGE_SIZE
): Promise<{ leaderboardRewards: EarnerEntry[] } | null> {
  return fetchLeaderboard('earners', limit);
}

export function fetchCompactBoard(): Promise<CompactLeaderboard | null> {
  return fetchLeaderboard('compact');
}

export function formatNearCompact(yocto: string | number): string {
  const raw = Number.parseFloat(yoctoToNear(String(yocto ?? '0')));
  if (!Number.isFinite(raw) || raw === 0) return '0';

  if (raw >= 1_000_000) return `${(raw / 1_000_000).toFixed(2)}M`;
  if (raw >= 10_000) return `${(raw / 1_000).toFixed(2)}K`;
  if (raw >= 1_000)
    return raw.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (raw >= 1)
    return raw.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return raw.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export function formatSocialCompact(yocto: string | number): string {
  const raw = Number.parseFloat(yoctoToSocial(String(yocto ?? '0')));
  if (!Number.isFinite(raw) || raw === 0) return '0';

  if (raw >= 1_000_000) return `${(raw / 1_000_000).toFixed(1)}M`;
  if (raw >= 10_000) return `${(raw / 1_000).toFixed(1)}K`;
  if (raw >= 1_000)
    return raw.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return raw.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
