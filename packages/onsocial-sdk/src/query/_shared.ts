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
  /**
   * Public counts and the quoted post, when `posts_feed` is serving the
   * paint columns. Absent until Hasura tracks them — callers keep the
   * second read in that case.
   */
  replyCount?: number | string | null;
  quoteCount?: number | string | null;
  repostCount?: number | string | null;
  reactionCount?: number | string | null;
  quotedPost?: PostRow | string | null;
  quotedRefPost?: PostRow | string | null;
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
  replyCount quoteCount repostCount reactionCount quotedPost quotedRefPost
`;

/** Paint columns stripped when Hasura has not tracked them yet. */
export const FEED_POST_ROW_PAINT_FIELDS =
  'replyCount quoteCount repostCount reactionCount quotedPost quotedRefPost';

export function stripFeedPaintFields(query: string): string {
  return query.replace(FEED_POST_ROW_PAINT_FIELDS, '');
}

/** Home / list feed ranking. `hot` needs `posts_feed.amplify_heat`. */
export type FeedSort = 'recent' | 'hot';

/** Profile feed section filter for `feed.recent`. */
export type FeedSection = 'posts' | 'replies' | 'reposts';

export function feedOrderByClause(sort: FeedSort = 'recent'): string {
  return sort === 'hot'
    ? '[{amplifyHeat: DESC}, {blockHeight: DESC}]'
    : '[{blockHeight: DESC}, {contentPath: DESC}]';
}

/**
 * GraphQL `_and` fragment for a descending (height, contentPath) keyset.
 * Callers still declare `$beforeBlockHeight` / `$beforePostKey`.
 */
export function chronoContentPathKeysetAnd(): string {
  return `{_or: [
    {blockHeight: {_lt: $beforeBlockHeight}},
    {_and: [
      {blockHeight: {_eq: $beforeBlockHeight}},
      {contentPath: {_lt: $beforePostKey}}
    ]}
  ]}`;
}

/**
 * GraphQL `_and` fragment for guild `postsCurrent` (no contentPath column) —
 * (height, accountId, groupId, postId) matches group content-path order.
 */
export function chronoGroupRowKeysetAnd(): string {
  return `{_or: [
    {blockHeight: {_lt: $beforeBlockHeight}},
    {_and: [
      {blockHeight: {_eq: $beforeBlockHeight}},
      {accountId: {_lt: $beforeAccountId}}
    ]},
    {_and: [
      {blockHeight: {_eq: $beforeBlockHeight}},
      {accountId: {_eq: $beforeAccountId}},
      {groupId: {_lt: $beforeGroupId}}
    ]},
    {_and: [
      {blockHeight: {_eq: $beforeBlockHeight}},
      {accountId: {_eq: $beforeAccountId}},
      {groupId: {_eq: $beforeGroupId}},
      {postId: {_lt: $beforePostId}}
    ]}
  ]}`;
}

/** Parse `{account}/groups/{group}/content/post/{postId}` for guild keysets. */
export function parseGroupPostContentPath(path: string): {
  accountId: string;
  groupId: string;
  postId: string;
} | null {
  const match = path
    .trim()
    .match(/^([^/]+)\/groups\/([^/]+)\/content\/post\/([^/]+)$/);
  if (!match) return null;
  return {
    accountId: match[1]!,
    groupId: match[2]!,
    postId: match[3]!,
  };
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

/** Exclusive keyset upper bound — drop non-positive / non-finite. */
export function normalizeBeforeBlockHeight(
  value: number | undefined
): number | undefined {
  if (value == null || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

/** Chrono / Hot tie-break — group-aware content path (matches SQL `content_path`). */
export function postContentPath(row: PostRow): string {
  if (row.groupId) {
    return `${row.accountId}/groups/${row.groupId}/content/post/${row.postId}`;
  }
  return `${row.accountId}/post/${row.postId}`;
}

/** Trimmed content-path cursor leg — empty / whitespace → undefined. */
export function normalizeBeforePostKey(
  value: string | undefined
): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Hot keyset heat leg — drop non-finite. */
export function normalizeBeforeHeat(
  value: number | undefined
): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  return value;
}

/**
 * Chrono keyset needs height + content path together. Incomplete pairs are
 * rejected so callers cannot silently fall back to height-only skip.
 */
export function requireChronoKeyset(opts: {
  beforeBlockHeight?: number;
  beforePostKey?: string;
}):
  | { ok: true; before: number; beforePostKey: string }
  | { ok: true; before?: undefined; beforePostKey?: undefined }
  | { ok: false; message: string } {
  const before = normalizeBeforeBlockHeight(opts.beforeBlockHeight);
  const beforePostKey = normalizeBeforePostKey(opts.beforePostKey);
  if (before === undefined && beforePostKey === undefined) {
    return { ok: true };
  }
  if (before === undefined || beforePostKey === undefined) {
    return {
      ok: false,
      message:
        'chrono keyset requires beforeBlockHeight and beforePostKey together',
    };
  }
  return { ok: true, before, beforePostKey };
}

/**
 * Descending chrono page cursor — height + content path (matches `feed_recent`
 * ROW). Prefer keyset over offset when both are present (live inserts /
 * working-set trim).
 */
export function chronoDescPage(
  items: PostRow[],
  limit: number,
  opts: {
    offset: number;
    usedKeyset: boolean;
    /** Stub/raw count when hydrate can drop rows (topic indexes). */
    edgeCount?: number;
    edgeHeight?: number;
    /** Override tip row when edgeHeight is supplied without the row. */
    edgeRow?: PostRow;
  }
): {
  items: PostRow[];
  nextOffset?: number;
  nextBeforeBlockHeight?: number;
  nextBeforeEventKey?: string;
} {
  const edgeCount = opts.edgeCount ?? items.length;
  if (edgeCount < limit) return { items };
  const edgeRow = opts.edgeRow ?? items[items.length - 1];
  const edgeHeight =
    opts.edgeHeight ??
    (typeof edgeRow?.blockHeight === 'number' ? edgeRow.blockHeight : undefined);
  const nextBefore =
    typeof edgeHeight === 'number' && Number.isFinite(edgeHeight)
      ? edgeHeight
      : undefined;
  const nextKey = edgeRow ? postContentPath(edgeRow) : undefined;
  const keyset =
    nextBefore !== undefined && nextKey
      ? {
          nextBeforeBlockHeight: nextBefore,
          nextBeforeEventKey: nextKey,
        }
      : undefined;
  if (opts.usedKeyset) {
    return keyset ? { items, ...keyset } : { items };
  }
  return {
    items,
    nextOffset: opts.offset + limit,
    ...keyset,
  };
}
