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
}

/** Row from `hashtag_counts` view. */
export interface HashtagCount {
  hashtag: string;
  postCount: number;
  lastBlock: number;
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
