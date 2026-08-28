// ---------------------------------------------------------------------------
// Internal helpers shared across query domain modules.
// ---------------------------------------------------------------------------

/**
 * Thrown when the GraphQL endpoint returns errors and no `data` payload.
 * This typically indicates schema drift between the SDK's queries and the
 * deployed Hasura schema (e.g. a column added to a view that hasn't been
 * re-introspected). Letting it bubble prevents `res.data?.x ?? []` from
 * silently producing empty results.
 */
export class GraphQLValidationError extends Error {
  errors: Array<{ message: string; [key: string]: unknown }>;
  constructor(
    message: string,
    errors: Array<{ message: string; [key: string]: unknown }>
  ) {
    super(`GraphQL query failed: ${message}`);
    this.name = 'GraphQLValidationError';
    this.errors = errors;
  }
}

/** Row from `postsCurrent` / `postsFeed` view. */
export interface PostRow {
  accountId: string;
  postId: string;
  value: string;
  blockHeight: number;
  blockTimestamp: number;
  receiptId?: string;
  parentPath?: string;
  parentAuthor?: string;
  parentType?: string;
  refPath?: string;
  refAuthor?: string;
  refType?: string;
  channel?: string;
  kind?: string;
  audiences?: string;
  groupId?: string;
  isGroupContent?: boolean;
  /** Conversation root — equals this post when it is the thread head. */
  rootPath?: string;
  rootAuthor?: string;
  /** Present when row comes from `posts_feed` or client enrich. */
  authorName?: string | null;
  authorAvatar?: string | null;
  groupName?: string | null;
  /**
   * Soft amplify ranking heat from `posts_feed.amplify_heat`
   * (decaying; 0 when cold / unavailable).
   */
  amplifyHeat?: number | null;
  /** Present when client enrich hydrates quoted-author shells. */
  refAuthorName?: string | null;
  refAuthorAvatar?: string | null;
}

export const POST_ROW_FIELDS = `
  accountId postId value blockHeight blockTimestamp receiptId
  parentPath parentAuthor parentType refPath refAuthor refType channel kind audiences
  groupId isGroupContent
`;

export const FEED_POST_ROW_FIELDS = `
  accountId postId value blockHeight blockTimestamp receiptId
  parentPath parentAuthor parentType refPath refAuthor refType channel kind audiences
  groupId isGroupContent
  authorName authorAvatar groupName amplifyHeat
`;

/** Home / list feed ranking. `hot` needs `posts_feed.amplify_heat`. */
export type FeedSort = 'recent' | 'hot';

/** Profile feed section filter for `feed.recent`. */
export type FeedSection = 'posts' | 'replies' | 'reposts';

export function feedOrderByClause(sort: FeedSort = 'recent'): string {
  return sort === 'hot'
    ? '[{amplifyHeat: DESC}, {blockHeight: DESC}]'
    : '[{blockHeight: DESC}]';
}

export function accountFromContentPath(path: string): string {
  const [accountId] = path.split('/', 1);
  if (!accountId) {
    throw new Error(`invalid content path: ${path}`);
  }
  return accountId;
}

import type { GroupPostRef } from '../types.js';

export function groupPostPathValue(pathOrRef: string | GroupPostRef): string {
  if (typeof pathOrRef === 'string') return pathOrRef;
  return `${pathOrRef.author}/groups/${pathOrRef.groupId}/content/post/${pathOrRef.postId}`;
}

export function audienceLikeValue(audience: string): string {
  return `%|${audience}|%`;
}
