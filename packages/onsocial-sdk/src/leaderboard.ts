/**
 * Shared protocol leaderboard helpers (reputation / influence / earners).
 * Host apps own UI + BFF; keep formatters and field contracts here.
 */

export type LeaderboardTrack = 'influence' | 'reputation' | 'earners';

export const LEADERBOARD_TRACKS: {
  id: LeaderboardTrack;
  label: string;
  /** Visual weight in track tabs — earners stay available but quieter. */
  emphasis?: 'primary' | 'tertiary';
}[] = [
  { id: 'reputation', label: 'Reputation' },
  { id: 'influence', label: 'Influence' },
  { id: 'earners', label: 'Earners', emphasis: 'tertiary' },
];

export function leaderboardTrackSubtitle(track: LeaderboardTrack): string {
  switch (track) {
    case 'reputation':
      return 'Protocol reputation';
    case 'influence':
      return 'Boost influence';
    case 'earners':
      return 'Rewards earned';
  }
}

export const LEADERBOARD_PAGE_SIZE = 20;

/** leaderboard_boost view (core columns). */
export interface InfluenceEntry {
  accountId: string;
  lockedAmount: string;
  effectiveBoost: string;
  lockMonths: number;
  totalClaimed?: string;
  totalCreditsPurchased?: string;
  lastEventBlock?: number;
  rank: number;
}

/** leaderboard_rewards view (core columns). */
export interface EarnerEntry {
  accountId: string;
  totalEarned: string;
  totalClaimed?: string;
  unclaimed?: string;
  creditCount?: number;
  lastCreditBlock?: number;
  lastClaimBlock?: number;
  rank: number;
}

/** reputation_scores view (protocol reputation v1). */
export interface ReputationEntry {
  accountId: string;
  standingWith: number;
  standingOut?: number;
  mutualStanding: number;
  endorsementsReceived: number;
  paidSupportSpenders?: number;
  uniqueInboundPeers?: number;
  uniqueScarceFans?: number;
  amplifyEvents?: number;
  boost: string;
  lockMonths: number;
  rewardsEarned?: string;
  totalPosts: number;
  replyCount?: number;
  reactionsReceived: number;
  avgReactions?: number;
  activeDays: number;
  uniqueConversations?: number;
  scarcesCreated: number;
  scarcesSold?: number;
  scarcesRevenueNear?: string;
  socialScore: string;
  commitmentScore: string;
  qualityScore: string;
  consistencyScore: string;
  scarcesScore: string;
  reputation: string;
  confidenceScore: string;
  rank: number;
}

/** Full GraphQL selection for `reputationScores` — source of truth for BFFs. */
export const REPUTATION_SCORES_GRAPHQL_FIELDS = `
  accountId
  standingWith
  standingOut
  mutualStanding
  endorsementsReceived
  paidSupportSpenders
  uniqueInboundPeers
  uniqueScarceFans
  amplifyEvents
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
  confidenceScore
  rank
`.trim();

/** Slimmer board list selection (app slide-over / compact rows). */
export const REPUTATION_BOARD_GRAPHQL_FIELDS = `
  accountId
  standingWith
  mutualStanding
  endorsementsReceived
  paidSupportSpenders
  uniqueInboundPeers
  uniqueScarceFans
  amplifyEvents
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

/** Alias used by portal copy. */
export const formatReputation = formatReputationScore;

/** Component scores in the reputation breakdown. */
export function formatReputationComponent(value: string | number): string {
  const num = Number.parseFloat(String(value));
  if (!Number.isFinite(num) || num === 0) return '0';
  if (num >= 100) return num.toFixed(0);
  return num.toFixed(1);
}

/** Alias used by portal score chips. */
export const formatScore = formatReputationComponent;

export function commitmentLabel(months: number): string {
  if (months >= 48) return 'Citadel';
  if (months >= 24) return 'Vanguard';
  if (months >= 12) return 'Anchor';
  if (months >= 6) return 'Steady';
  if (months >= 1) return 'Scout';
  return 'Observer';
}

export function commitmentAccent(
  months: number
): 'gold' | 'purple' | 'blue' | 'green' | 'neutral' {
  if (months >= 48) return 'gold';
  if (months >= 24) return 'purple';
  if (months >= 12) return 'blue';
  if (months >= 6) return 'green';
  return 'neutral';
}

/** Quiet rank band for list meta — not a verified badge. */
export function reputationTierLabel(rank: number): string {
  if (rank <= 1) return 'Legend';
  if (rank <= 3) return 'Elite';
  if (rank <= 10) return 'Rising';
  if (rank <= 25) return 'Active';
  return 'New';
}

export function reputationTier(rank: number): {
  label: string;
  accent: 'gold' | 'purple' | 'blue' | 'green' | 'neutral';
} {
  if (rank <= 1) return { label: 'Legend', accent: 'gold' };
  if (rank <= 3) return { label: 'Elite', accent: 'purple' };
  if (rank <= 10) return { label: 'Rising', accent: 'blue' };
  if (rank <= 25) return { label: 'Active', accent: 'green' };
  return { label: 'New', accent: 'neutral' };
}

export function reputationConfidenceLabel(
  confidenceScore?: string | number | null
): { label: string; detail: string } {
  const score = Number.parseFloat(String(confidenceScore ?? ''));
  if (!Number.isFinite(score)) {
    return {
      label: 'Building',
      detail:
        'Updates from weighted stands, endorsements, paid support, posts, boost, and marketplace activity.',
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
        'Forming from social graph, conversations, boost, and marketplace activity.',
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

export function truncateAccountId(id: string, max = 20): string {
  if (id.length <= max) return id;
  return `${id.slice(0, max - 4)}…${id.slice(-4)}`;
}

export function canonicalLeaderboardAccountId(accountId: string): string {
  return accountId.trim().toLowerCase();
}

export function findViewerEntry(
  rows: ReadonlyArray<{ accountId: string }>,
  viewerAccountId: string | null | undefined
): { index: number; entry: { accountId: string } } | null {
  if (!viewerAccountId) return null;
  const needle = canonicalLeaderboardAccountId(viewerAccountId);
  const index = rows.findIndex(
    (row) => canonicalLeaderboardAccountId(row.accountId) === needle
  );
  if (index < 0) return null;
  return { index, entry: rows[index]! };
}
