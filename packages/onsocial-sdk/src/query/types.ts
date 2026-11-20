// Shared row shapes used by query helpers (match Hasura GraphQL camelCase schema)
import type { PostRow } from './_shared.js';

export type { PostRow } from './_shared.js';

/** Row from `reactionsCurrent` view. */
export interface ReactionRow {
  accountId: string;
  postOwner: string;
  path: string;
  value: string;
  blockHeight: number;
  blockTimestamp: number;
  operation: string;
}

/** Paginated result set. */
export interface Paginated<T> {
  items: T[];
  /** Offset for the next page, or `undefined` if this was the last page. */
  nextOffset?: number;
  /**
   * Keyset cursor for ascending `blockHeight` pages (`_gt` on the next fetch).
   * Prefer this over `nextOffset` when both are present.
   */
  nextAfterBlockHeight?: number;
  /**
   * Keyset cursor for descending `blockHeight` pages (`_lt` on the next fetch).
   * Prefer this over `nextOffset` when both are present.
   */
  nextBeforeBlockHeight?: number;
  /**
   * Pulse Hot card cursor — pair with `nextBeforeBlockHeight` and
   * `nextBeforeEventKey` (`event_heat` / `event_key` in `feed_pulse`).
   */
  nextBeforeHeat?: number;
  /** Pulse card tie-break (`event_key` in `feed_pulse`). */
  nextBeforeEventKey?: string;
}

/** Row from `hashtag_counts` view. */
export interface HashtagCount {
  hashtag: string;
  postCount: number;
  lastBlock: number;
  /** Last mention time — set on `recentMentions`, not the count view. */
  lastTimestamp?: number;
}

/** Row from `ticker_counts` view. */
export interface TickerCount {
  ticker: string;
  postCount: number;
  lastBlock: number;
  lastTimestamp?: number;
}

/** Row from `place_counts` view. */
export interface PlaceCount {
  place: string;
  postCount: number;
  lastBlock: number;
  lastTimestamp?: number;
}

export interface GroupConversation {
  root: PostRow | null;
  replies: PostRow[];
  quotes: PostRow[];
}

export interface GroupFeedFilter {
  groupId: string;
  channel?: string;
  kind?: string;
  audience?: string;
  limit?: number;
  offset?: number;
}

export interface FeedFilter {
  accounts: string[];
  channel?: string;
  kind?: string;
  audience?: string;
  limit?: number;
  offset?: number;
}
