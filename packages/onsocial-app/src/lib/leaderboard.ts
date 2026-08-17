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
  scarcesScore: string;
  reputation: string;
  confidenceScore: string;
  rank: number;
}

export interface LeaderboardBoardResponse {
  leaderboardBoost?: InfluenceEntry[];
  reputationScores?: ReputationEntry[];
  leaderboardRewards?: EarnerEntry[];
}

export const LEADERBOARD_TRACKS: {
  id: LeaderboardTrack;
  label: string;
}[] = [
  { id: 'reputation', label: 'Reputation' },
  { id: 'influence', label: 'Influence' },
  { id: 'earners', label: 'Earners' },
];

export const LEADERBOARD_PAGE_SIZE = 20;
/** Above hug sheets (boost / reputation facts ~56) and nested manage slides. */
export const LEADERBOARD_Z = 74;

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
  scarcesScore
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

/** Component scores in the reputation breakdown (0–100 scale). */
export function formatReputationComponent(value: string | number): string {
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

/** Quiet rank band for list meta — not a verified badge. */
export function reputationTierLabel(rank: number): string {
  if (rank <= 1) return 'Legend';
  if (rank <= 3) return 'Elite';
  if (rank <= 10) return 'Rising';
  if (rank <= 25) return 'Active';
  return 'New';
}

export function reputationConfidenceLabel(
  confidenceScore?: string | number | null
): { label: string; detail: string } {
  const score = Number.parseFloat(String(confidenceScore ?? ''));
  if (!Number.isFinite(score)) {
    return {
      label: 'Building',
      detail:
        'Updates from indexed stands, endorsements, posts, boost, and marketplace activity.',
    };
  }
  if (score < 0.35) {
    return {
      label: 'Limited data',
      detail: 'Few signals indexed yet — rank may shift as activity grows.',
    };
  }
  if (score < 0.6) {
    return {
      label: 'Building',
      detail:
        'Forming from weighted stands/endorsements, posts, boost, and marketplace activity.',
    };
  }
  return {
    label: 'Established',
    detail: 'Backed by a broad set of indexed protocol signals.',
  };
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

export function entriesForTrack(
  scope: LeaderboardTrack,
  data: LeaderboardBoardResponse | null | undefined
): InfluenceEntry[] | ReputationEntry[] | EarnerEntry[] | null {
  if (!data) return null;
  if (scope === 'influence') return data.leaderboardBoost ?? [];
  if (scope === 'reputation') return data.reputationScores ?? [];
  return data.leaderboardRewards ?? [];
}

/** Client fetch for the in-app leaderboard slide-over. */
export async function fetchLeaderboardBoard(
  scope: LeaderboardTrack,
  limit = LEADERBOARD_PAGE_SIZE
): Promise<LeaderboardBoardResponse | null> {
  const params = new URLSearchParams({
    scope,
    limit: String(limit),
  });
  try {
    const res = await fetch(`/api/leaderboard?${params.toString()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as LeaderboardBoardResponse;
  } catch {
    return null;
  }
}
