import { formatSocialCompact } from '@/lib/format-social-balance';
import { SHEET_Z } from '@/lib/sheet-z';
import {
  LEADERBOARD_PAGE_SIZE,
  LEADERBOARD_TRACKS,
  REPUTATION_BOARD_GRAPHQL_FIELDS,
  commitmentLabel,
  computeLeaderboardRankPresentation,
  filterLeaderboardEarnerRows,
  findViewerEntry,
  formatReputationComponent,
  formatReputationScore,
  influenceBoardMeta,
  isLeaderboardEarnerRanked,
  leaderboardRankLabel,
  leaderboardPrimaryUnit,
  leaderboardShareCopy,
  leaderboardTrackHint,
  leaderboardTrackSubtitle,
  leaderboardViewerLine,
  pctOfLeader,
  reputationBoardMeta,
  reputationConfidenceLabel,
  reputationTierLabel,
  type EarnerEntry,
  type InfluenceEntry,
  type LeaderboardTrack,
  type ReputationEntry,
} from '@onsocial/sdk';
import type { ProfileReputation } from '@/lib/profile-signals';

export type { EarnerEntry, InfluenceEntry, LeaderboardTrack, ReputationEntry };
export {
  LEADERBOARD_PAGE_SIZE,
  LEADERBOARD_TRACKS,
  REPUTATION_BOARD_GRAPHQL_FIELDS,
  commitmentLabel,
  computeLeaderboardRankPresentation,
  filterLeaderboardEarnerRows,
  findViewerEntry,
  formatReputationComponent,
  formatReputationScore,
  influenceBoardMeta,
  isLeaderboardEarnerRanked,
  leaderboardRankLabel,
  leaderboardPrimaryUnit,
  leaderboardShareCopy,
  leaderboardTrackHint,
  leaderboardTrackSubtitle,
  leaderboardViewerLine,
  pctOfLeader,
  reputationBoardMeta,
  reputationConfidenceLabel,
  reputationTierLabel,
  formatSocialCompact,
};

/**
 * Last offset the board API will serve. Pages are 20, so this is the top
 * ~220 rows. Past this the list stops instead of repeating the last page.
 */
export const LEADERBOARD_MAX_OFFSET = 200;

/** Another page exists only inside the top window. */
export function leaderboardHasMorePage(input: {
  incomingCount: number;
  pageSize: number;
  offset: number;
}): boolean {
  if (input.incomingCount < input.pageSize) return false;
  return input.offset + input.pageSize <= LEADERBOARD_MAX_OFFSET;
}

/**
 * Header status. Hidden when the pinned row is already on screen.
 * The metric lives on the row, not under the title.
 */
export function leaderboardHeaderYouLine(input: {
  rank: number | null | undefined;
  pinVisible: boolean;
}): string | null {
  if (input.pinVisible) return null;
  if (input.rank == null || !Number.isFinite(input.rank)) return null;
  const rank = Math.max(1, Math.floor(input.rank));
  return `You're #${rank}`;
}

/** Index of a board inside the side-by-side pager. */
export function leaderboardTrackIndex(track: LeaderboardTrack): number {
  const index = LEADERBOARD_TRACKS.findIndex((item) => item.id === track);
  return index < 0 ? 0 : index;
}

/**
 * Board under a horizontal pager offset. Halfway across a page settles on
 * the next board so the chip matches the page you are entering.
 */
export function leaderboardTrackFromPager(
  scrollLeft: number,
  pageWidth: number
): LeaderboardTrack {
  const fallback = LEADERBOARD_TRACKS[0]?.id ?? 'reputation';
  if (
    !Number.isFinite(scrollLeft) ||
    !Number.isFinite(pageWidth) ||
    pageWidth <= 0
  ) {
    return fallback;
  }
  const index = Math.round(scrollLeft / pageWidth);
  const clamped = Math.min(LEADERBOARD_TRACKS.length - 1, Math.max(0, index));
  return LEADERBOARD_TRACKS[clamped]?.id ?? fallback;
}

/** 0–2 pager progress. The chip fill tracks this, not the snapped board. */
export function leaderboardPagerProgress(
  scrollLeft: number,
  pageWidth: number
): number {
  const last = Math.max(0, LEADERBOARD_TRACKS.length - 1);
  if (
    !Number.isFinite(scrollLeft) ||
    !Number.isFinite(pageWidth) ||
    pageWidth <= 0
  ) {
    return 0;
  }
  return Math.min(last, Math.max(0, scrollLeft / pageWidth));
}

/** Adjacent board colors for a traveling chip fill. Mix is 0–1 toward `to`. */
export function leaderboardThumbBlend(progress: number): {
  from: LeaderboardTrack;
  to: LeaderboardTrack;
  mix: number;
} {
  const last = Math.max(0, LEADERBOARD_TRACKS.length - 1);
  const clamped = Math.min(last, Math.max(0, progress));
  const end = LEADERBOARD_TRACKS[last]?.id ?? 'reputation';
  if (clamped >= last) return { from: end, to: end, mix: 0 };
  const index = Math.floor(clamped);
  const from = LEADERBOARD_TRACKS[index]?.id ?? 'reputation';
  const to = LEADERBOARD_TRACKS[index + 1]?.id ?? from;
  return { from, to, mix: clamped - index };
}

/** Selected fill between equal chip boxes, in the row's coordinate space. */
export function leaderboardThumbBox(
  progress: number,
  boxes: ReadonlyArray<{ left: number; width: number }>
): { left: number; width: number } | null {
  if (boxes.length === 0) return null;
  const last = boxes.length - 1;
  const clamped = Math.min(last, Math.max(0, progress));
  const from = boxes[Math.floor(clamped)];
  const to = boxes[Math.ceil(clamped)] ?? from;
  if (!from || !to) return null;
  const mix = clamped - Math.floor(clamped);
  return {
    left: from.left + (to.left - from.left) * mix,
    width: from.width + (to.width - from.width) * mix,
  };
}

/** Above hug sheets (boost / reputation facts ~56) and nested manage slides. */
export const LEADERBOARD_Z = SHEET_Z.board;
/** Nested reputation peek opened from the leaderboard. */
export const LEADERBOARD_FACTS_Z = LEADERBOARD_Z + 4;

export interface LeaderboardBoardResponse {
  leaderboardBoost?: InfluenceEntry[];
  reputationScores?: ReputationEntry[];
  leaderboardRewards?: EarnerEntry[];
  /** Viewer row when not in the top page (or when mirrored from the list). */
  viewerEntry?: InfluenceEntry | ReputationEntry | EarnerEntry | null;
}

export type LeaderboardTrackCache = {
  board: LeaderboardBoardResponse;
  hasMore: boolean;
};

export function entriesForTrack(
  scope: LeaderboardTrack,
  data: LeaderboardBoardResponse | null | undefined
): InfluenceEntry[] | ReputationEntry[] | EarnerEntry[] | null {
  if (!data) return null;
  if (scope === 'influence') return data.leaderboardBoost ?? [];
  if (scope === 'reputation') return data.reputationScores ?? [];
  return data.leaderboardRewards ?? [];
}

function listKeyForTrack(
  scope: LeaderboardTrack
): 'leaderboardBoost' | 'reputationScores' | 'leaderboardRewards' {
  if (scope === 'influence') return 'leaderboardBoost';
  if (scope === 'reputation') return 'reputationScores';
  return 'leaderboardRewards';
}

function mergeAccountRows<T extends { accountId: string }>(
  existing: T[],
  incoming: T[]
): T[] {
  const seen = new Set(existing.map((row) => row.accountId.toLowerCase()));
  const next = [...existing];
  for (const row of incoming) {
    const key = row.accountId.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(row);
  }
  return next;
}

export function appendLeaderboardPage(
  scope: LeaderboardTrack,
  current: LeaderboardBoardResponse | null | undefined,
  page: LeaderboardBoardResponse,
  pageSize = LEADERBOARD_PAGE_SIZE
): LeaderboardTrackCache {
  const key = listKeyForTrack(scope);
  const incoming = (page[key] ?? []) as Array<{ accountId: string }>;
  const existing = (current?.[key] ?? []) as Array<{ accountId: string }>;
  const merged = mergeAccountRows(existing, incoming);
  const offset = existing.length;
  const board: LeaderboardBoardResponse = {
    ...(current ?? {}),
    ...page,
    [key]: merged,
    viewerEntry:
      current?.viewerEntry !== undefined
        ? current.viewerEntry
        : (page.viewerEntry ?? null),
  };
  return {
    board,
    hasMore: leaderboardHasMorePage({
      incomingCount: incoming.length,
      pageSize,
      offset,
    }),
  };
}

export function reputationEntryToProfile(
  entry: ReputationEntry
): ProfileReputation {
  return {
    reputation: Number.parseFloat(String(entry.reputation)) || 0,
    rank: entry.rank,
    socialScore: Number.parseFloat(String(entry.socialScore)) || 0,
    commitmentScore: Number.parseFloat(String(entry.commitmentScore)) || 0,
    qualityScore: Number.parseFloat(String(entry.qualityScore)) || 0,
    consistencyScore: Number.parseFloat(String(entry.consistencyScore)) || 0,
    scarcesScore: Number.parseFloat(String(entry.scarcesScore)) || 0,
    confidenceScore: Number.parseFloat(String(entry.confidenceScore)) || 0,
    totalPosts: entry.totalPosts,
    paidSupportSpenders: entry.paidSupportSpenders ?? 0,
    uniqueInboundPeers: entry.uniqueInboundPeers ?? 0,
    uniqueScarceFans: entry.uniqueScarceFans ?? 0,
    amplifyEvents: entry.amplifyEvents ?? 0,
    lockMonths: entry.lockMonths,
  };
}

/** Client fetch for the in-app leaderboard slide-over. */
export async function fetchLeaderboardBoard(
  scope: LeaderboardTrack,
  options: {
    limit?: number;
    offset?: number;
    viewerAccountId?: string | null;
  } = {}
): Promise<LeaderboardBoardResponse | null> {
  const limit = options.limit ?? LEADERBOARD_PAGE_SIZE;
  const offset = options.offset ?? 0;
  const params = new URLSearchParams({
    scope,
    limit: String(limit),
    offset: String(offset),
  });
  if (options.viewerAccountId) {
    params.set('viewer', options.viewerAccountId);
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
