// ---------------------------------------------------------------------------
// Thread queries — replies and quotes for a post (by id or by full path).
// Accessed as `os.query.threads.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';
import type { Paginated, PostRow } from './types.js';
import { accountFromContentPath } from './_shared.js';

const DEFAULT_THREAD_LIMIT = 100;
const DEFAULT_THREAD_TREE_DEPTH = 4;
const DEFAULT_THREAD_TREE_MAX_NODES = 500;
const DEFAULT_THREAD_TREE_PAGE_SIZE = 100;
const MAX_THREAD_TREE_DEPTH = 12;
const MAX_THREAD_TREE_PAGE_SIZE = 250;

interface ReplyRow {
  replyAuthor: string;
  replyId: string;
  value: string;
  blockHeight: number;
  blockTimestamp: number;
  groupId?: string;
  parentAuthor: string;
  parentPath: string;
  parentType?: string;
}

function mapReply(r: ReplyRow): PostRow {
  return {
    accountId: r.replyAuthor,
    postId: r.replyId,
    value: r.value,
    blockHeight: r.blockHeight,
    blockTimestamp: r.blockTimestamp,
    parentAuthor: r.parentAuthor,
    parentPath: r.parentPath,
    parentType: r.parentType,
    groupId: r.groupId,
  };
}

interface QuoteRow {
  quoteAuthor: string;
  quoteId: string;
  value: string;
  blockHeight: number;
  blockTimestamp: number;
  groupId?: string;
  refAuthor: string;
  refPath: string;
  refType?: string;
}

function mapQuote(q: QuoteRow): PostRow {
  return {
    accountId: q.quoteAuthor,
    postId: q.quoteId,
    value: q.value,
    blockHeight: q.blockHeight,
    blockTimestamp: q.blockTimestamp,
    refAuthor: q.refAuthor,
    refPath: q.refPath,
    refType: q.refType,
    groupId: q.groupId,
  };
}

export type ThreadEdge = 'reply' | 'quote';

export interface ThreadNode {
  /** The reply or quote post represented by this node. */
  post: PostRow;
  /** Full indexed content path for this post. */
  path: string;
  /** Relationship from the parent node/root to this node. */
  edge: ThreadEdge;
  /** 1 for direct children of the root, 2+ for nested descendants. */
  depth: number;
  /** Replies directly attached to this post. */
  replies: ThreadNode[];
  /** Quotes directly attached to this post. */
  quotes: ThreadNode[];
}

export interface ThreadTree {
  /** Full indexed path used as the tree root. */
  rootPath: string;
  /** Direct reply branches. */
  replies: ThreadNode[];
  /** Direct quote branches. */
  quotes: ThreadNode[];
  /** Depth-first descendant list, excluding the root post itself. */
  flat: ThreadNode[];
  /** True when `maxNodes` stopped expansion before all fetched branches were traversed. */
  truncated: boolean;
}

export interface ThreadTreeOptions {
  /** Maximum descendant depth. `1` returns direct replies/quotes only. Defaults to 4. */
  depth?: number;
  /** Maximum replies to fetch per parent. Defaults to 100. */
  replyLimit?: number;
  /** Maximum quotes to fetch per parent. Defaults to 100. */
  quoteLimit?: number;
  /** GraphQL page size used while walking long sibling lists. Defaults to 100. */
  pageSize?: number;
  /** Total reply/quote nodes to return before stopping expansion. Defaults to 500. */
  maxNodes?: number;
  /** Include quote branches while walking the tree. Defaults to true. */
  includeQuotes?: boolean;
}

interface ResolvedThreadTreeOptions {
  depth: number;
  replyLimit: number;
  quoteLimit: number;
  pageSize: number;
  maxNodes: number;
  includeQuotes: boolean;
}

interface TreeState {
  visited: Set<string>;
  count: number;
  truncated: boolean;
}

function positiveInt(
  value: number | undefined,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER
): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
}

function nonNegativeInt(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value) || value < 0) return fallback;
  return Math.floor(value);
}

function resolveTreeOptions(
  opts: ThreadTreeOptions
): ResolvedThreadTreeOptions {
  return {
    depth: Math.min(
      nonNegativeInt(opts.depth, DEFAULT_THREAD_TREE_DEPTH),
      MAX_THREAD_TREE_DEPTH
    ),
    replyLimit: positiveInt(opts.replyLimit, DEFAULT_THREAD_LIMIT),
    quoteLimit: positiveInt(opts.quoteLimit, DEFAULT_THREAD_LIMIT),
    pageSize: positiveInt(
      opts.pageSize,
      DEFAULT_THREAD_TREE_PAGE_SIZE,
      MAX_THREAD_TREE_PAGE_SIZE
    ),
    maxNodes: positiveInt(opts.maxNodes, DEFAULT_THREAD_TREE_MAX_NODES),
    includeQuotes: opts.includeQuotes ?? true,
  };
}

function postContentPath(row: PostRow): string {
  if (row.groupId) {
    return `${row.accountId}/groups/${row.groupId}/content/post/${row.postId}`;
  }
  return `${row.accountId}/post/${row.postId}`;
}

function flattenThreadNodes(nodes: ThreadNode[]): ThreadNode[] {
  return nodes.flatMap((node) => [
    node,
    ...flattenThreadNodes(node.replies),
    ...flattenThreadNodes(node.quotes),
  ]);
}

export class ThreadsQuery {
  constructor(private _q: QueryModule) {}

  /**
   * Replies to a post.
   *
   * ```ts
   * const replies = await os.query.threads.replies('alice.near', 'my-post-id');
   * ```
   */
  async replies(
    parentAuthor: string,
    postId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<PostRow[]> {
    const parentPath = `${parentAuthor}/post/${postId}`;
    return (await this._repliesPageByPath(parentPath, opts)).items;
  }

  private async _repliesPageByPath(
    parentPath: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<Paginated<PostRow>> {
    const res = await this._q.graphql<{ threadReplies: ReplyRow[] }>({
      query: `query RepliesByPath($parentAuthor: String!, $parentPath: String!, $limit: Int!, $offset: Int!) {
        threadReplies(
          where: {parentAuthor: {_eq: $parentAuthor}, parentPath: {_eq: $parentPath}},
          limit: $limit,
          offset: $offset,
          orderBy: [{blockHeight: ASC}]
        ) {
          replyAuthor replyId value blockHeight blockTimestamp groupId
          parentAuthor parentPath parentType
        }
      }`,
      variables: {
        parentAuthor: accountFromContentPath(parentPath),
        parentPath,
        limit: positiveInt(opts.limit, DEFAULT_THREAD_LIMIT),
        offset: nonNegativeInt(opts.offset, 0),
      },
    });
    const items = (res.data?.threadReplies ?? []).map(mapReply);
    const limit = positiveInt(opts.limit, DEFAULT_THREAD_LIMIT);
    const offset = nonNegativeInt(opts.offset, 0);
    return {
      items,
      nextOffset: items.length >= limit ? offset + limit : undefined,
    };
  }

  /**
   * Replies to a post by its full indexed content path.
   *
   * ```ts
   * const replies = await os.query.threads.repliesByPath(
   *   'alice.near/groups/dao/content/post/123'
   * );
   * ```
   */
  async repliesByPath(
    parentPath: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<PostRow[]> {
    return (await this._repliesPageByPath(parentPath, opts)).items;
  }

  /**
   * Quotes of a post.
   *
   * ```ts
   * const quotes = await os.query.threads.quotes('alice.near', 'my-post-id');
   * ```
   */
  async quotes(
    refAuthor: string,
    postId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<PostRow[]> {
    const refPath = `${refAuthor}/post/${postId}`;
    return (await this._quotesPageByPath(refPath, opts)).items;
  }

  private async _quotesPageByPath(
    refPath: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<Paginated<PostRow>> {
    const res = await this._q.graphql<{ quotes: QuoteRow[] }>({
      query: `query QuotesByPath($refAuthor: String!, $refPath: String!, $limit: Int!, $offset: Int!) {
        quotes(
          where: {refAuthor: {_eq: $refAuthor}, refPath: {_eq: $refPath}},
          limit: $limit,
          offset: $offset,
          orderBy: [{blockHeight: ASC}]
        ) {
          quoteAuthor quoteId value blockHeight blockTimestamp groupId
          refAuthor refPath refType
        }
      }`,
      variables: {
        refAuthor: accountFromContentPath(refPath),
        refPath,
        limit: positiveInt(opts.limit, DEFAULT_THREAD_LIMIT),
        offset: nonNegativeInt(opts.offset, 0),
      },
    });
    const items = (res.data?.quotes ?? []).map(mapQuote);
    const limit = positiveInt(opts.limit, DEFAULT_THREAD_LIMIT);
    const offset = nonNegativeInt(opts.offset, 0);
    return {
      items,
      nextOffset: items.length >= limit ? offset + limit : undefined,
    };
  }

  /**
   * Quotes of a post by its full indexed content path.
   *
   * ```ts
   * const quotes = await os.query.threads.quotesByPath(
   *   'alice.near/groups/dao/content/post/123'
   * );
   * ```
   */
  async quotesByPath(
    refPath: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<PostRow[]> {
    return (await this._quotesPageByPath(refPath, opts)).items;
  }

  /**
   * Recursive reply/quote tree for a top-level account post.
   *
   * ```ts
   * const tree = await os.query.threads.tree('alice.near', 'root', {
   *   depth: 5,
   *   includeQuotes: true,
   * });
   * ```
   */
  tree(
    rootAuthor: string,
    postId: string,
    opts: ThreadTreeOptions = {}
  ): Promise<ThreadTree> {
    return this.treeByPath(`${rootAuthor}/post/${postId}`, opts);
  }

  /**
   * Recursive reply/quote tree for any indexed content path, including group posts.
   */
  async treeByPath(
    rootPath: string,
    opts: ThreadTreeOptions = {}
  ): Promise<ThreadTree> {
    const resolved = resolveTreeOptions(opts);
    const state: TreeState = {
      visited: new Set([rootPath]),
      count: 0,
      truncated: false,
    };
    const { replies, quotes } = await this._children(
      rootPath,
      1,
      resolved,
      state
    );

    return {
      rootPath,
      replies,
      quotes,
      flat: [...flattenThreadNodes(replies), ...flattenThreadNodes(quotes)],
      truncated: state.truncated,
    };
  }

  private async _children(
    parentPath: string,
    depth: number,
    opts: ResolvedThreadTreeOptions,
    state: TreeState
  ): Promise<{ replies: ThreadNode[]; quotes: ThreadNode[] }> {
    if (depth > opts.depth || state.count >= opts.maxNodes) {
      if (state.count >= opts.maxNodes) state.truncated = true;
      return { replies: [], quotes: [] };
    }

    const replyRows = await this._fetchAllReplies(parentPath, opts, state);
    const replies = await this._expandRows(
      replyRows,
      'reply',
      depth,
      opts,
      state
    );

    if (!opts.includeQuotes || state.count >= opts.maxNodes) {
      if (state.count >= opts.maxNodes) state.truncated = true;
      return { replies, quotes: [] };
    }

    const quoteRows = await this._fetchAllQuotes(parentPath, opts, state);
    const quotes = await this._expandRows(
      quoteRows,
      'quote',
      depth,
      opts,
      state
    );

    return { replies, quotes };
  }

  private async _expandRows(
    rows: PostRow[],
    edge: ThreadEdge,
    depth: number,
    opts: ResolvedThreadTreeOptions,
    state: TreeState
  ): Promise<ThreadNode[]> {
    const nodes: ThreadNode[] = [];
    for (const post of rows) {
      if (state.count >= opts.maxNodes) {
        state.truncated = true;
        break;
      }

      const path = postContentPath(post);
      const node: ThreadNode = {
        post,
        path,
        edge,
        depth,
        replies: [],
        quotes: [],
      };
      nodes.push(node);
      state.count += 1;

      if (depth >= opts.depth || state.visited.has(path)) continue;
      state.visited.add(path);

      const children = await this._children(path, depth + 1, opts, state);
      node.replies = children.replies;
      node.quotes = children.quotes;
    }
    return nodes;
  }

  private async _fetchAllReplies(
    parentPath: string,
    opts: ResolvedThreadTreeOptions,
    state: TreeState
  ): Promise<PostRow[]> {
    return this._fetchAllByPath(parentPath, opts.replyLimit, opts, state, (p) =>
      this._repliesPageByPath(p.parentPath, {
        limit: p.limit,
        offset: p.offset,
      })
    );
  }

  private async _fetchAllQuotes(
    refPath: string,
    opts: ResolvedThreadTreeOptions,
    state: TreeState
  ): Promise<PostRow[]> {
    return this._fetchAllByPath(refPath, opts.quoteLimit, opts, state, (p) =>
      this._quotesPageByPath(p.parentPath, {
        limit: p.limit,
        offset: p.offset,
      })
    );
  }

  private async _fetchAllByPath(
    parentPath: string,
    perParentLimit: number,
    opts: ResolvedThreadTreeOptions,
    state: TreeState,
    fetchPage: (page: {
      parentPath: string;
      limit: number;
      offset: number;
    }) => Promise<Paginated<PostRow>>
  ): Promise<PostRow[]> {
    const rows: PostRow[] = [];
    let offset = 0;

    while (rows.length < perParentLimit) {
      const remainingNodeBudget = opts.maxNodes - state.count - rows.length;
      if (remainingNodeBudget <= 0) {
        state.truncated = true;
        break;
      }

      const limit = Math.min(
        opts.pageSize,
        perParentLimit - rows.length,
        remainingNodeBudget
      );
      const page = await fetchPage({ parentPath, limit, offset });
      rows.push(...page.items);

      if (!page.nextOffset || page.items.length === 0) break;
      offset = page.nextOffset;
    }

    return rows;
  }
}
