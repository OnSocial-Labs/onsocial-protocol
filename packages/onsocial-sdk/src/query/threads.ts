// ---------------------------------------------------------------------------
// Thread queries — replies and quotes for a post (by id or by full path).
// Accessed as `os.query.threads.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';
import type { PostRow } from './types.js';
import { accountFromContentPath } from './_shared.js';

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
    opts: { limit?: number } = {}
  ): Promise<PostRow[]> {
    const parentPath = `${parentAuthor}/post/${postId}`;
    const res = await this._q.graphql<{ threadReplies: ReplyRow[] }>({
      query: `query Replies($parentAuthor: String!, $parentPath: String!, $limit: Int!) {
        threadReplies(
          where: {parentAuthor: {_eq: $parentAuthor}, parentPath: {_eq: $parentPath}},
          limit: $limit,
          orderBy: [{blockHeight: ASC}]
        ) {
          replyAuthor replyId value blockHeight blockTimestamp groupId
          parentAuthor parentPath parentType
        }
      }`,
      variables: { parentAuthor, parentPath, limit: opts.limit ?? 100 },
    });
    return (res.data?.threadReplies ?? []).map(mapReply);
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
    opts: { limit?: number } = {}
  ): Promise<PostRow[]> {
    const parentAuthor = accountFromContentPath(parentPath);
    const res = await this._q.graphql<{ threadReplies: ReplyRow[] }>({
      query: `query RepliesByPath($parentAuthor: String!, $parentPath: String!, $limit: Int!) {
        threadReplies(
          where: {parentAuthor: {_eq: $parentAuthor}, parentPath: {_eq: $parentPath}},
          limit: $limit,
          orderBy: [{blockHeight: ASC}]
        ) {
          replyAuthor replyId value blockHeight blockTimestamp groupId
          parentAuthor parentPath parentType
        }
      }`,
      variables: { parentAuthor, parentPath, limit: opts.limit ?? 100 },
    });
    return (res.data?.threadReplies ?? []).map(mapReply);
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
    opts: { limit?: number } = {}
  ): Promise<PostRow[]> {
    const refPath = `${refAuthor}/post/${postId}`;
    const res = await this._q.graphql<{ quotes: QuoteRow[] }>({
      query: `query Quotes($refAuthor: String!, $refPath: String!, $limit: Int!) {
        quotes(
          where: {refAuthor: {_eq: $refAuthor}, refPath: {_eq: $refPath}},
          limit: $limit,
          orderBy: [{blockHeight: ASC}]
        ) {
          quoteAuthor quoteId value blockHeight blockTimestamp groupId
          refAuthor refPath refType
        }
      }`,
      variables: { refAuthor, refPath, limit: opts.limit ?? 100 },
    });
    return (res.data?.quotes ?? []).map(mapQuote);
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
    opts: { limit?: number } = {}
  ): Promise<PostRow[]> {
    const refAuthor = accountFromContentPath(refPath);
    const res = await this._q.graphql<{ quotes: QuoteRow[] }>({
      query: `query QuotesByPath($refAuthor: String!, $refPath: String!, $limit: Int!) {
        quotes(
          where: {refAuthor: {_eq: $refAuthor}, refPath: {_eq: $refPath}},
          limit: $limit,
          orderBy: [{blockHeight: ASC}]
        ) {
          quoteAuthor quoteId value blockHeight blockTimestamp groupId
          refAuthor refPath refType
        }
      }`,
      variables: { refAuthor, refPath, limit: opts.limit ?? 100 },
    });
    return (res.data?.quotes ?? []).map(mapQuote);
  }
}
