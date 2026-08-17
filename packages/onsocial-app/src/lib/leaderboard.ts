import { formatSocialCompact } from '@/lib/format-social-balance';
import {
  LEADERBOARD_PAGE_SIZE,
  LEADERBOARD_TRACKS,
  REPUTATION_BOARD_GRAPHQL_FIELDS,
  commitmentLabel,
  findViewerEntry,
  formatReputationComponent,
  formatReputationScore,
  pctOfLeader,
  reputationConfidenceLabel,
  reputationTierLabel,
  type EarnerEntry,
  type InfluenceEntry,
  type LeaderboardTrack,
  type ReputationEntry,
} from '@onsocial/sdk';

export type { EarnerEntry, InfluenceEntry, LeaderboardTrack, ReputationEntry };
export {
  LEADERBOARD_PAGE_SIZE,
  LEADERBOARD_TRACKS,
  REPUTATION_BOARD_GRAPHQL_FIELDS,
  commitmentLabel,
  findViewerEntry,
  formatReputationComponent,
  formatReputationScore,
  pctOfLeader,
  reputationConfidenceLabel,
  reputationTierLabel,
  formatSocialCompact,
};

/** Above hug sheets (boost / reputation facts ~56) and nested manage slides. */
export const LEADERBOARD_Z = 74;

export interface LeaderboardBoardResponse {
  leaderboardBoost?: InfluenceEntry[];
  reputationScores?: ReputationEntry[];
  leaderboardRewards?: EarnerEntry[];
  /** Viewer row when not in the top page (or when mirrored from the list). */
  viewerEntry?: InfluenceEntry | ReputationEntry | EarnerEntry | null;
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
  limit = LEADERBOARD_PAGE_SIZE,
  viewerAccountId?: string | null
): Promise<LeaderboardBoardResponse | null> {
  const params = new URLSearchParams({
    scope,
    limit: String(limit),
  });
  if (viewerAccountId) {
    params.set('viewer', viewerAccountId);
  }
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
