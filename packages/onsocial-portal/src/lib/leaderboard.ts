import { yoctoToSocial } from '@/lib/near-rpc';

// ---------------------------------------------------------------------------
// Types — match Hasura graphql-default camelCase from materialized views
// ---------------------------------------------------------------------------

/** leaderboard_boost view */
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

/** leaderboard_rewards view */
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

/** reputation_scores view */
export interface ReputationEntry {
  accountId: string;
  standingWith: number;
  standingOut: number;
  boost: string;
  lockMonths: number;
  rewardsEarned: string;
  totalPosts: number;
  replyCount: number;
  reactionsReceived: number;
  avgReactions: number;
  activeDays: number;
  uniqueConversations: number;
  scarcesCreated: number;
  scarcesSold: number;
  scarcesRevenueNear: string;
  socialScore: string;
  commitmentScore: string;
  qualityScore: string;
  consistencyScore: string;
  scarcesScore: string;
  reputation: string;
  rank: number;
}

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

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

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
  limit = 20
): Promise<{ leaderboardBoost: InfluenceEntry[] } | null> {
  return fetchLeaderboard('influence', limit);
}

export function fetchReputationBoard(
  limit = 20
): Promise<{ reputationScores: ReputationEntry[] } | null> {
  return fetchLeaderboard('reputation', limit);
}

export function fetchEarnerBoard(
  limit = 20
): Promise<{ leaderboardRewards: EarnerEntry[] } | null> {
  return fetchLeaderboard('earners', limit);
}

export function fetchCompactBoard(): Promise<CompactLeaderboard | null> {
  return fetchLeaderboard('compact');
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

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

export function formatReputation(value: string | number): string {
  const num = Number.parseFloat(String(value));
  if (!Number.isFinite(num) || num === 0) return '0';
  if (num >= 10_000) return `${(num / 1_000).toFixed(1)}K`;
  if (num >= 100) return num.toFixed(0);
  return num.toFixed(1);
}

export function formatScore(value: string | number): string {
  const num = Number.parseFloat(String(value));
  if (!Number.isFinite(num) || num === 0) return '0';
  if (num >= 100) return num.toFixed(0);
  return num.toFixed(1);
}

export function truncateAccountId(id: string, max = 20): string {
  if (id.length <= max) return id;
  return `${id.slice(0, max - 4)}…${id.slice(-4)}`;
}

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
): 'amber' | 'purple' | 'blue' | 'green' | 'slate' {
  if (months >= 48) return 'amber';
  if (months >= 24) return 'purple';
  if (months >= 12) return 'blue';
  if (months >= 6) return 'green';
  return 'slate';
}

/** Maps a reputation rank → tier name */
export function reputationTier(rank: number): {
  label: string;
  accent: 'amber' | 'purple' | 'blue' | 'green' | 'slate';
} {
  if (rank <= 1) return { label: 'Legend', accent: 'amber' };
  if (rank <= 3) return { label: 'Elite', accent: 'purple' };
  if (rank <= 10) return { label: 'Rising', accent: 'blue' };
  if (rank <= 25) return { label: 'Active', accent: 'green' };
  return { label: 'New', accent: 'slate' };
}

/** Percent bar width (0–100) for a value against the leader */
export function pctOfLeader(value: string | number, leader: string | number): number {
  const v = Number.parseFloat(String(value));
  const l = Number.parseFloat(String(leader));
  if (!Number.isFinite(v) || !Number.isFinite(l) || l === 0) return 0;
  return Math.min(100, Math.round((v / l) * 100));
}
