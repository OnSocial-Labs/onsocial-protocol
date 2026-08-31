/**
 * Shared protocol leaderboard helpers (reputation / influence / earners).
 * Host apps own UI + BFF; keep formatters and field contracts here.
 */

export type LeaderboardTrack = 'influence' | 'reputation' | 'earners';

export const LEADERBOARD_TRACKS: {
  id: LeaderboardTrack;
  label: string;
}[] = [
  { id: 'reputation', label: 'Reputation' },
  { id: 'influence', label: 'Influence' },
  { id: 'earners', label: 'Earners' },
];

export function leaderboardTrackSubtitle(track: LeaderboardTrack): string {
  switch (track) {
    case 'reputation':
      return 'All-time weighted score';
    case 'influence':
      return 'Locked SOCIAL × time';
    case 'earners':
      return 'All-time SOCIAL earned';
  }
}

/** Short column unit under the ranked value on board rows. */
export function leaderboardPrimaryUnit(track: LeaderboardTrack): string {
  switch (track) {
    case 'reputation':
      return 'Score';
    case 'influence':
      return 'Boost';
    case 'earners':
      return 'SOCIAL';
  }
}

/** One quiet explainer under track segments — only when the metric needs it. */
export function leaderboardTrackHint(track: LeaderboardTrack): string | null {
  switch (track) {
    case 'influence':
      return 'More locked, longer term — higher influence.';
    case 'reputation':
    case 'earners':
      return null;
  }
}

/** Quiet orientation line for the connected viewer on a track. */
export function leaderboardViewerLine(input: {
  rank: number;
  primary: string;
}): string {
  const rank = Math.max(1, Math.floor(input.rank));
  return `You're #${rank} · ${input.primary}`;
}

/** Share sheet title/body for the leaderboard page on a track. */
export function leaderboardShareCopy(track: LeaderboardTrack): {
  title: string;
  text: string;
} {
  switch (track) {
    case 'reputation':
      return {
        title: 'OnSocial reputation leaderboard',
        text: 'All-time protocol reputation rankings on OnSocial.',
      };
    case 'influence':
      return {
        title: 'OnSocial influence leaderboard',
        text: 'See who leads on influence — locked SOCIAL × lock length.',
      };
    case 'earners':
      return {
        title: 'OnSocial earners leaderboard',
        text: 'Top all-time SOCIAL earners on OnSocial.',
      };
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

/**
 * One comparable meta line for reputation board rows.
 * Standing only — blank when zero. Never swap to posts / days / tier.
 */
export function reputationBoardMeta(entry: {
  standingWith: number;
  totalPosts?: number;
  activeDays?: number;
  rank?: number;
}): string {
  if (entry.standingWith > 0) {
    return entry.standingWith === 1
      ? '1 standing'
      : `${entry.standingWith} standing`;
  }
  return '';
}

/**
 * One comparable meta line for influence board rows — lock duration only.
 * Blank when unlocked (Observer). Prefer months over tier names on list surfaces.
 */
export function influenceBoardMeta(entry: { lockMonths: number }): string {
  const months = Math.max(0, Math.floor(entry.lockMonths));
  if (months <= 0) return '';
  return months === 1 ? '1 mo lock' : `${months} mo lock`;
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

export type LeaderboardRankPresentation = {
  /** 1-based position in the loaded list (breaks ties). */
  denseIndex: number;
  rank: number;
  tied: boolean;
  rankLabel: string;
};

export function leaderboardRankLabel(rank: number, tied: boolean): string {
  const normalized = Math.max(1, Math.floor(rank));
  return tied ? `T${normalized}` : String(normalized);
}

/** Competition rank + dense index for tied rows on the loaded page. */
export function computeLeaderboardRankPresentation(
  rows: ReadonlyArray<{ rank: number }>
): LeaderboardRankPresentation[] {
  const rankCounts = new Map<number, number>();
  for (const row of rows) {
    const rank = Math.max(1, Math.floor(row.rank));
    rankCounts.set(rank, (rankCounts.get(rank) ?? 0) + 1);
  }
  return rows.map((row, index) => {
    const rank = Math.max(1, Math.floor(row.rank));
    const tied = (rankCounts.get(rank) ?? 0) > 1;
    return {
      denseIndex: index + 1,
      rank,
      tied,
      rankLabel: leaderboardRankLabel(rank, tied),
    };
  });
}

export function parseLeaderboardAmount(value: string | number): number {
  const amount = Number.parseFloat(String(value));
  return Number.isFinite(amount) ? amount : 0;
}

export function isLeaderboardEarnerRanked(
  entry: Pick<EarnerEntry, 'totalEarned'>
): boolean {
  return parseLeaderboardAmount(entry.totalEarned) > 0;
}

/** Drop zero-earned rows from the earners board — they read as unranked noise. */
export function filterLeaderboardEarnerRows<T extends EarnerEntry>(
  rows: ReadonlyArray<T>
): T[] {
  return rows.filter(isLeaderboardEarnerRanked);
}
