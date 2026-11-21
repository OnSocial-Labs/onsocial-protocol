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
  /**
   * Offset for the next page, or `undefined` if this was the last page.
   *
   * @deprecated For `feed.recent` / `fromAccounts` / `pulse`, prefer the
   * composite keyset (`nextBeforeBlockHeight` + `nextBeforeEventKey`, and
   * `nextBeforeHeat` for Hot). Full pages no longer return `nextOffset` when
   * a keyset is available — height-only / offset-only load-more is legacy.
   */
  nextOffset?: number;
  /**
   * Keyset cursor for ascending `blockHeight` pages (`_gt` on the next fetch).
   * Prefer this over `nextOffset` when both are present.
   */
  nextAfterBlockHeight?: number;
  /**
   * Descending keyset height leg. Must be paired with `nextBeforeEventKey`
   * (and `nextBeforeHeat` for Hot) — height alone is rejected by the SDK.
   */
  nextBeforeBlockHeight?: number;
  /**
   * Hot keyset heat — Pulse `event_heat` or Global/Circle `amplify_heat`.
   * Pair with `nextBeforeBlockHeight` and `nextBeforeEventKey`.
   */
  nextBeforeHeat?: number;
  /**
   * Keyset tie-break — Pulse `event_key`, Hot/`feed_recent` content path
   * (`before_post_key`), or guild group content path.
   */
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
  /**
   * Chrono keyset height — require `beforePostKey` (group content path).
   * Prefer over `offset` under live inserts / working-set trim.
   */
  beforeBlockHeight?: number;
  /** Group content-path tie-break for chrono keyset. */
  beforePostKey?: string;
}

export interface FeedFilter {
  accounts: string[];
  channel?: string;
  kind?: string;
  audience?: string;
  limit?: number;
  offset?: number;
}
