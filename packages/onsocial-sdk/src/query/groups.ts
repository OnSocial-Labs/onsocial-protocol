// ---------------------------------------------------------------------------
// Group queries — group feeds, single-post lookup, threads, conversations.
// Accessed as `os.query.groups.<method>()`.
// ---------------------------------------------------------------------------

import type { GroupPostRef } from '../types.js';
import type { QueryModule } from './index.js';
import type {
  GroupConversation,
  GroupFeedFilter,
  Paginated,
  PostRow,
} from './types.js';
import {
  POST_ROW_FIELDS,
  audienceLikeValue,
  groupPostPathValue,
} from './_shared.js';

export class GroupsQuery {
  constructor(private _q: QueryModule) {}

  /**
   * Feed for a specific group.
   *
   * ```ts
   * const { items } = await os.query.groups.feed({ groupId: 'dao', limit: 20 });
   * ```
   */
  async feed(opts: {
    groupId: string;
    limit?: number;
    offset?: number;
  }): Promise<Paginated<PostRow>> {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const res = await this._q.graphql<{ postsCurrent: PostRow[] }>({
      query: `query GroupFeed($groupId: String!, $limit: Int!, $offset: Int!) {
        postsCurrent(
          where: {
            groupId: {_eq: $groupId},
            isGroupContent: {_eq: true}
          },
          limit: $limit,
          offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) {
          ${POST_ROW_FIELDS}
        }
      }`,
      variables: { groupId: opts.groupId, limit, offset },
    });
    const rows = res.data?.postsCurrent ?? [];
    return {
      items: rows,
      nextOffset: rows.length >= limit ? offset + limit : undefined,
    };
  }

  /**
   * Group feed filtered by canonical post metadata (channel, kind, audience).
   *
   * ```ts
   * const { items } = await os.query.groups.feedFiltered({
   *   groupId: 'dao',
   *   channel: 'engineering',
   *   kind: 'announcement',
   * });
   * ```
   */
  async feedFiltered(opts: GroupFeedFilter): Promise<Paginated<PostRow>> {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;

    const res = await this._q.graphql<{ postsCurrent: PostRow[] }>({
      query: `query FilteredGroupFeed($groupId: String!, $limit: Int!, $offset: Int!${opts.channel !== undefined ? ', $channel: String!' : ''}${opts.kind !== undefined ? ', $kind: String!' : ''}${opts.audience !== undefined ? ', $audienceLike: String!' : ''}) {
        postsCurrent(
          where: {_and: [
            {groupId: {_eq: $groupId}},
            {isGroupContent: {_eq: true}}${opts.channel !== undefined ? ', {channel: {_eq: $channel}}' : ''}${opts.kind !== undefined ? ', {kind: {_eq: $kind}}' : ''}${opts.audience !== undefined ? ', {audiences: {_like: $audienceLike}}' : ''}
          ]},
          limit: $limit,
          offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) {
          ${POST_ROW_FIELDS}
        }
      }`,
      variables: {
        groupId: opts.groupId,
        limit,
        offset,
        ...(opts.channel !== undefined ? { channel: opts.channel } : {}),
        ...(opts.kind !== undefined ? { kind: opts.kind } : {}),
        ...(opts.audience !== undefined
          ? { audienceLike: audienceLikeValue(opts.audience) }
          : {}),
      },
    });

    const rows = res.data?.postsCurrent ?? [];
    return {
      items: rows,
      nextOffset: rows.length >= limit ? offset + limit : undefined,
    };
  }

  /**
   * Single group post by typed reference.
   *
   * ```ts
   * const post = await os.query.groups.post({
   *   author: 'alice.near', groupId: 'dao', postId: '123'
   * });
   * ```
   */
  async post(post: GroupPostRef): Promise<PostRow | null> {
    const res = await this._q.graphql<{ postsCurrent: PostRow[] }>({
      query: `query GroupPost($accountId: String!, $groupId: String!, $postId: String!) {
        postsCurrent(
          where: {
            accountId: {_eq: $accountId},
            groupId: {_eq: $groupId},
            postId: {_eq: $postId},
            isGroupContent: {_eq: true}
          },
          limit: 1,
          orderBy: [{blockHeight: DESC}]
        ) {
          ${POST_ROW_FIELDS}
        }
      }`,
      variables: {
        accountId: post.author,
        groupId: post.groupId,
        postId: post.postId,
      },
    });

    return res.data?.postsCurrent?.[0] ?? null;
  }

  /**
   * Reply thread for a group post by reference or full path.
   *
   * ```ts
   * const replies = await os.query.groups.thread({
   *   author: 'alice.near', groupId: 'dao', postId: '123'
   * });
   * ```
   */
  thread(
    rootPath: string | GroupPostRef,
    opts: { limit?: number } = {}
  ): Promise<PostRow[]> {
    return this._q.threads.repliesByPath(groupPostPathValue(rootPath), opts);
  }

  /**
   * Quotes of a group post by typed reference.
   *
   * ```ts
   * const quotes = await os.query.groups.quotes({
   *   author: 'alice.near', groupId: 'dao', postId: '123'
   * });
   * ```
   */
  quotes(
    post: GroupPostRef,
    opts: { limit?: number } = {}
  ): Promise<PostRow[]> {
    return this._q.threads.quotesByPath(groupPostPathValue(post), opts);
  }

  /**
   * Group conversation root post + replies + quotes in one call.
   *
   * ```ts
   * const convo = await os.query.groups.conversation({
   *   author: 'alice.near', groupId: 'dao', postId: '123'
   * });
   * ```
   */
  async conversation(
    post: GroupPostRef,
    opts: { replyLimit?: number; quoteLimit?: number } = {}
  ): Promise<GroupConversation> {
    const [root, replies, quotes] = await Promise.all([
      this.post(post),
      this.thread(post, { limit: opts.replyLimit }),
      this.quotes(post, { limit: opts.quoteLimit }),
    ]);
    return { root, replies, quotes };
  }
}
