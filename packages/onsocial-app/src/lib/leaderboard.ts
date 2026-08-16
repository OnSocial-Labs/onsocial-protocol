import { formatSocialCompact } from '@/lib/format-social-balance';

export type LeaderboardTrack = 'influence' | 'reputation' | 'earners';

export interface InfluenceEntry {
  accountId: string;
  lockedAmount: string;
  effectiveBoost: string;
  lockMonths: number;
  rank: number;
}

export interface EarnerEntry {
  accountId: string;
  totalEarned: string;
  unclaimed?: string;
  rank: number;
}

/** `reputation_scores` view (protocol reputation v1). */
export interface ReputationEntry {
  accountId: string;
  standingWith: number;
  mutualStanding: number;
  endorsementsReceived: number;
  boost: string;
  lockMonths: number;
  totalPosts: number;
  activeDays: number;
  reactionsReceived: number;
  scarcesCreated: number;
  socialScore: string;
  commitmentScore: string;
  qualityScore: string;
  consistencyScore: string;
  reputation: string;
  confidenceScore: string;
  rank: number;
}

export const REPUTATION_BOARD_GRAPHQL_FIELDS = `
  accountId
  standingWith
  mutualStanding
  endorsementsReceived
  boost
  lockMonths
  totalPosts
  activeDays
  reactionsReceived
  scarcesCreated
  socialScore
  commitmentScore
  qualityScore
  consistencyScore
  reputation
  confidenceScore
  rank
`.trim();

export function formatReputationScore(value: string | number): string {
  const num = Number.parseFloat(String(value));
  if (!Number.isFinite(num) || num === 0) return '0';
  if (num >= 10_000) return `${(num / 1_000).toFixed(1)}K`;
  if (num >= 100) return num.toFixed(0);
  return num.toFixed(1);
}

export function formatLeaderboardScore(value: string | number): string {
  const num = Number.parseFloat(String(value));
  if (!Number.isFinite(num) || num === 0) return '0';
  if (num >= 100) return num.toFixed(0);
  return num.toFixed(1);
}

export { formatSocialCompact };

export function commitmentLabel(months: number): string {
  if (months >= 48) return 'Citadel';
  if (months >= 24) return 'Vanguard';
  if (months >= 12) return 'Anchor';
  if (months >= 6) return 'Steady';
  if (months >= 1) return 'Scout';
  return 'Observer';
}

export function reputationTierLabel(rank: number): string {
  if (rank <= 1) return 'Legend';
  if (rank <= 3) return 'Elite';
  if (rank <= 10) return 'Rising';
  if (rank <= 25) return 'Active';
  return 'New';
}

export function pctOfLeader(
  value: string | number,
  leader: string | number
): number {
  const n = Number.parseFloat(String(value));
  const top = Number.parseFloat(String(leader));
  if (!Number.isFinite(n) || !Number.isFinite(top) || top <= 0) return 0;
  return Math.max(0, Math.min(100, (n / top) * 100));
}

/** Client fetch for the in-app leaderboard slide-over. */
export async function fetchLeaderboardBoard(
  scope: LeaderboardTrack,
  limit = 20
): Promise<{
  leaderboardBoost?: InfluenceEntry[];
  reputationScores?: ReputationEntry[];
  leaderboardRewards?: EarnerEntry[];
} | null> {
  const params = new URLSearchParams({
    scope,
    limit: String(limit),
  });
  try {
    const res = await fetch(`/api/leaderboard?${params.toString()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as {
      leaderboardBoost?: InfluenceEntry[];
      reputationScores?: ReputationEntry[];
      leaderboardRewards?: EarnerEntry[];
    };
  } catch {
    return null;
  }
}
