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
import type { ThreadTree, ThreadTreeOptions } from './threads.js';
import {
  GraphQLValidationError,
  POST_ROW_FIELDS,
  audienceLikeValue,
  groupPostPathValue,
} from './_shared.js';

const GROUP_CURRENT_SHELL_FIELDS = `
  groupId
  ownerId
  groupName
  groupDescription
  groupBannerCid
  groupBadgeCid
  isPublic
  isMemberDriven
  blockHeight
  blockTimestamp
`;

const GROUP_CURRENT_SHELL_FIELDS_WITH_TOPICS = `
  ${GROUP_CURRENT_SHELL_FIELDS}
  groupTopics
`;

const GROUP_BY_MEMBERS_SHELL_FIELDS = `
  ${GROUP_CURRENT_SHELL_FIELDS}
  memberCount
`;

const GROUP_BY_MEMBERS_SHELL_FIELDS_WITH_TOPICS = `
  ${GROUP_BY_MEMBERS_SHELL_FIELDS}
  groupTopics
`;

const GROUP_MEMBERSHIP_SHELL_FIELDS = `
  groupId
  memberId
  role
  level
  isOwner
  isAdmin
  canModerate
  groupName
  groupDescription
  groupBannerCid
  groupBadgeCid
  isPublic
  isMemberDriven
  blockHeight
  blockTimestamp
`;

const GROUP_MEMBERSHIP_SHELL_FIELDS_WITH_TOPICS = `
  ${GROUP_MEMBERSHIP_SHELL_FIELDS}
  groupTopics
`;

function isGroupTopicsUnavailableError(error: unknown): boolean {
  if (!(error instanceof GraphQLValidationError)) return false;
  const hay =
    `${error.message} ${error.errors.map((e) => e.message ?? '').join(' ')}`.toLowerCase();
  return (
    hay.includes('grouptopics') ||
    hay.includes('group_topics') ||
    hay.includes('field "grouptopics"') ||
    hay.includes("field 'grouptopics'")
  );
}

export interface GroupMembershipCurrentRow {
  groupId: string;
  memberId: string;
  role: string | null;
  level: number | null;
  isOwner: boolean;
  isAdmin: boolean;
  canModerate: boolean;
  groupName: string | null;
  groupDescription: string | null;
  groupBannerCid: string | null;
  groupBadgeCid: string | null;
  isPublic: boolean | null;
  isMemberDriven: boolean;
  /** Indexed topics from `groups_current.group_topics`. */
  groupTopics: string[] | null;
  blockHeight: number;
  blockTimestamp: number;
}

export type GroupMemberRow = Pick<
  GroupMembershipCurrentRow,
  | 'groupId'
  | 'memberId'
  | 'role'
  | 'level'
  | 'isOwner'
  | 'isAdmin'
  | 'canModerate'
  | 'blockHeight'
  | 'blockTimestamp'
>;

/** Active guild ban row from `group_blacklist_current`. */
export interface GroupBannedRow {
  groupId: string;
  memberId: string;
  blockHeight: number;
  blockTimestamp: number;
}

export interface GroupCurrentRow {
  groupId: string;
  ownerId: string;
  groupName: string | null;
  groupDescription: string | null;
  groupBannerCid: string | null;
  groupBadgeCid: string | null;
  isPublic: boolean | null;
  isMemberDriven: boolean;
  /** Indexed topics from latest group config JSON. */
  groupTopics: string[] | null;
  blockHeight: number;
  blockTimestamp: number;
  /** Present when browsing `groups_by_member_count`. */
  memberCount?: number | null;
}

/** Normalize Hasura `groupTopics` (text[] / null) for card shells. */
export function groupTopicsFromRow(
  row: { groupTopics?: string[] | null } | null | undefined
): string[] {
  if (!row?.groupTopics?.length) return [];
  return row.groupTopics
    .filter((topic): topic is string => typeof topic === 'string')
    .map((topic) => topic.trim())
    .filter(Boolean);
}

export class GroupsQuery {
  constructor(private _q: QueryModule) {}

  /**
   * Current guild/group memberships for an account, backed by
   * `group_members_current`.
   *
   * ```ts
   * const memberships = await os.query.groups.membershipsBy('alice.near');
   * ```
   */
  async membershipsBy(
    accountId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<Paginated<GroupMembershipCurrentRow>> {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const run = (fields: string) =>
      this._q.graphql<{
        groupMembersCurrent: GroupMembershipCurrentRow[];
      }>({
        query: `query GroupMembershipsBy($accountId: String!, $limit: Int!, $offset: Int!) {
          groupMembersCurrent(
            where: { memberId: {_eq: $accountId} },
            limit: $limit,
            offset: $offset,
            orderBy: [{blockHeight: DESC}]
          ) {
            ${fields}
          }
        }`,
        variables: { accountId, limit, offset },
      });

    let res;
    try {
      res = await run(GROUP_MEMBERSHIP_SHELL_FIELDS_WITH_TOPICS);
    } catch (error) {
      if (!isGroupTopicsUnavailableError(error)) throw error;
      res = await run(GROUP_MEMBERSHIP_SHELL_FIELDS);
    }
    const rows = res.data?.groupMembersCurrent ?? [];
    return {
      items: rows,
      nextOffset: rows.length >= limit ? offset + limit : undefined,
    };
  }

  /**
   * Current members of a guild/group, owner first then earliest joins,
   * backed by `group_members_current`.
   *
   * ```ts
   * const { items } = await os.query.groups.membersOf('dao', { limit: 8 });
   * ```
   */
  async membersOf(
    groupId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<Paginated<GroupMemberRow>> {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const res = await this._q.graphql<{
      groupMembersCurrent: GroupMemberRow[];
    }>({
      query: `query GroupMembersOf($groupId: String!, $limit: Int!, $offset: Int!) {
        groupMembersCurrent(
          where: { groupId: {_eq: $groupId} },
          limit: $limit,
          offset: $offset,
          orderBy: [{isOwner: DESC}, {blockHeight: ASC}]
        ) {
          groupId
          memberId
          role
          level
          isOwner
          isAdmin
          canModerate
          blockHeight
          blockTimestamp
        }
      }`,
      variables: { groupId, limit, offset },
    });
    const rows = res.data?.groupMembersCurrent ?? [];
    return {
      items: rows,
      nextOffset: rows.length >= limit ? offset + limit : undefined,
    };
  }

  /**
   * Active bans for a guild, backed by `group_blacklist_current`
   * (latest add_to_blacklist without a later remove_from_blacklist).
   *
   * ```ts
   * const { items } = await os.query.groups.bannedOf('dao', { limit: 40 });
   * ```
   */
  async bannedOf(
    groupId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<Paginated<GroupBannedRow>> {
    const limit = opts.limit ?? 40;
    const offset = opts.offset ?? 0;
    const res = await this._q.graphql<{
      groupBlacklistCurrent: GroupBannedRow[];
    }>({
      query: `query GroupBannedOf($groupId: String!, $limit: Int!, $offset: Int!) {
        groupBlacklistCurrent(
          where: { groupId: {_eq: $groupId} },
          limit: $limit,
          offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) {
          groupId
          memberId
          blockHeight
          blockTimestamp
        }
      }`,
      variables: { groupId, limit, offset },
    });
    const rows = res.data?.groupBlacklistCurrent ?? [];
    return {
      items: rows,
      nextOffset: rows.length >= limit ? offset + limit : undefined,
    };
  }

  /**
   * Indexed membership row for one account in a guild, backed by
   * `group_members_current`. Prefer this over multiple contract views for
   * isOwner / isAdmin / canModerate when indexer lag is acceptable.
   */
  async membershipFor(
    groupId: string,
    memberId: string
  ): Promise<GroupMemberRow | null> {
    const res = await this._q.graphql<{
      groupMembersCurrent: GroupMemberRow[];
    }>({
      query: `query GroupMembershipFor($groupId: String!, $memberId: String!) {
        groupMembersCurrent(
          where: {
            groupId: {_eq: $groupId},
            memberId: {_eq: $memberId}
          },
          limit: 1
        ) {
          groupId
          memberId
          role
          level
          isOwner
          isAdmin
          canModerate
          blockHeight
          blockTimestamp
        }
      }`,
      variables: { groupId, memberId },
    });
    return res.data?.groupMembersCurrent[0] ?? null;
  }

  /**
   * Recent post channel labels for a guild — minimal indexer payload for
   * room discovery (aggregate client-side).
   */
  async postChannelSample(
    groupId: string,
    opts: { limit?: number } = {}
  ): Promise<string[]> {
    const limit = opts.limit ?? 120;
    const res = await this._q.graphql<{
      postsCurrent: { channel: string | null }[];
    }>({
      query: `query GroupPostChannelSample($groupId: String!, $limit: Int!) {
        postsCurrent(
          where: {
            groupId: {_eq: $groupId},
            isGroupContent: {_eq: true},
            channel: {_is_null: false, _neq: ""}
          },
          limit: $limit,
          offset: 0,
          orderBy: [{blockHeight: DESC}]
        ) {
          channel
        }
      }`,
      variables: { groupId, limit },
    });
    return (res.data?.postsCurrent ?? [])
      .map((row) => row.channel?.trim())
      .filter((channel): channel is string => Boolean(channel));
  }

  /**
   * Member counts for many guilds in one GraphQL round-trip (indexed roster).
   */
  async memberCountsFor(groupIds: string[]): Promise<Map<string, number>> {
    const unique = [
      ...new Set(groupIds.map((id) => id.trim()).filter(Boolean)),
    ];
    const counts = new Map<string, number>();
    if (unique.length === 0) return counts;

    const chunkSize = 25;
    for (let offset = 0; offset < unique.length; offset += chunkSize) {
      const chunk = unique.slice(offset, offset + chunkSize);
      const aliasFields = chunk
        .map(
          (groupId, index) =>
            `g${index}: groupMembersCurrentAggregate(where: {groupId: {_eq: $id${index}}}) { aggregate { count } }`
        )
        .join('\n');
      const variableDecl = chunk
        .map((_, index) => `$id${index}: String!`)
        .join(', ');
      const variables: Record<string, string> = {};
      chunk.forEach((groupId, index) => {
        variables[`id${index}`] = groupId;
      });

      const res = await this._q.graphql<
        Record<string, { aggregate?: { count?: number | null } | null }>
      >({
        query: `query GroupMemberCounts(${variableDecl}) { ${aliasFields} }`,
        variables,
      });

      chunk.forEach((groupId, index) => {
        const count = res.data?.[`g${index}`]?.aggregate?.count;
        counts.set(groupId, typeof count === 'number' ? count : 0);
      });
    }

    return counts;
  }

  /**
   * Indexed post count for a guild (`posts_current` aggregate).
   * Includes replies/quotes that live in the group content namespace.
   */
  async postCountFor(groupId: string): Promise<number> {
    const id = groupId.trim();
    if (!id) return 0;
    const res = await this._q.graphql<{
      postsCurrentAggregate: {
        aggregate?: { count?: number | null } | null;
      };
    }>({
      query: `query GroupPostCount($groupId: String!) {
        postsCurrentAggregate(
          where: {
            groupId: {_eq: $groupId},
            isGroupContent: {_eq: true}
          }
        ) {
          aggregate { count }
        }
      }`,
      variables: { groupId: id },
    });
    const count = res.data?.postsCurrentAggregate?.aggregate?.count;
    return typeof count === 'number' && Number.isFinite(count)
      ? Math.max(0, Math.floor(count))
      : 0;
  }

  /**
   * Look up indexed guild rows by id (`groups_current`).
   *
   * ```ts
   * const rows = await os.query.groups.byIds(['dao', 'builders']);
   * ```
   */
  async byIds(groupIds: string[]): Promise<GroupCurrentRow[]> {
    const ids = Array.from(
      new Set(groupIds.map((id) => id.trim()).filter(Boolean))
    );
    if (ids.length === 0) return [];

    const run = (fields: string) =>
      this._q.graphql<{ groupsCurrent: GroupCurrentRow[] }>({
        query: `query GroupsByIds($ids: [String!]!, $limit: Int!) {
          groupsCurrent(
            where: { groupId: { _in: $ids } },
            limit: $limit
          ) {
            ${fields}
          }
        }`,
        variables: { ids, limit: ids.length },
      });

    try {
      const res = await run(GROUP_CURRENT_SHELL_FIELDS_WITH_TOPICS);
      return res.data?.groupsCurrent ?? [];
    } catch (error) {
      if (!isGroupTopicsUnavailableError(error)) throw error;
      const res = await run(GROUP_CURRENT_SHELL_FIELDS);
      return res.data?.groupsCurrent ?? [];
    }
  }

  /**
   * Browse indexed guilds from `groups_current` (discover / search).
   * Pass `sort: 'members'` to use `groups_by_member_count` (largest first).
   *
   * ```ts
   * const { items } = await os.query.groups.browse({ query: 'rebels', limit: 12 });
   * const popular = await os.query.groups.browse({ sort: 'members', publicOnly: true });
   * ```
   */
  async browse(
    opts: {
      query?: string;
      publicOnly?: boolean;
      /** `recent` = block height (default); `members` = roster size. */
      sort?: 'recent' | 'members';
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Paginated<GroupCurrentRow>> {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const query = opts.query?.trim();
    const queryLike = query ? `%${query}%` : undefined;
    const byMembers = opts.sort === 'members';
    const table = byMembers ? 'groupsByMemberCount' : 'groupsCurrent';
    const orderBy = byMembers
      ? '[{memberCount: DESC}, {blockHeight: DESC}]'
      : '[{blockHeight: DESC}]';
    const filters: string[] = [];
    if (opts.publicOnly) {
      filters.push('{isPublic: {_eq: true}}');
    }
    if (queryLike !== undefined) {
      filters.push(
        '{_or: [{groupName: {_ilike: $queryLike}}, {groupId: {_ilike: $queryLike}}]}'
      );
    }
    const whereClause =
      filters.length > 0 ? `where: {_and: [${filters.join(', ')}]},` : '';
    const run = (fields: string) =>
      this._q.graphql<{
        groupsCurrent?: GroupCurrentRow[];
        groupsByMemberCount?: GroupCurrentRow[];
      }>({
        query: `query BrowseGroups($limit: Int!, $offset: Int!${queryLike !== undefined ? ', $queryLike: String!' : ''}) {
          ${table}(
            ${whereClause}
            limit: $limit,
            offset: $offset,
            orderBy: ${orderBy}
          ) {
            ${fields}
          }
        }`,
        variables: {
          limit,
          offset,
          ...(queryLike !== undefined ? { queryLike } : {}),
        },
      });

    const fieldsWithTopics = byMembers
      ? GROUP_BY_MEMBERS_SHELL_FIELDS_WITH_TOPICS
      : GROUP_CURRENT_SHELL_FIELDS_WITH_TOPICS;
    const fieldsWithoutTopics = byMembers
      ? GROUP_BY_MEMBERS_SHELL_FIELDS
      : GROUP_CURRENT_SHELL_FIELDS;

    let res;
    try {
      res = await run(fieldsWithTopics);
    } catch (error) {
      if (!isGroupTopicsUnavailableError(error)) throw error;
      res = await run(fieldsWithoutTopics);
    }
    const rows =
      (byMembers ? res.data?.groupsByMemberCount : res.data?.groupsCurrent) ??
      [];
    return {
      items: rows,
      nextOffset: rows.length >= limit ? offset + limit : undefined,
    };
  }

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
   * Latest group posts across many guilds (one query).
   * Newest first — used by Guilds Home peeks.
   *
   * ```ts
   * const { items } = await os.query.groups.feedFromGroups({
   *   groupIds: ['guild-a', 'guild-b'],
   *   limit: 24,
   * });
   * ```
   */
  async feedFromGroups(opts: {
    groupIds: string[];
    limit?: number;
    offset?: number;
  }): Promise<Paginated<PostRow>> {
    const groupIds = [
      ...new Set(opts.groupIds.map((id) => id.trim()).filter(Boolean)),
    ];
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    if (groupIds.length === 0) {
      return { items: [], nextOffset: undefined };
    }
    const res = await this._q.graphql<{ postsCurrent: PostRow[] }>({
      query: `query GroupsFeed($groupIds: [String!]!, $limit: Int!, $offset: Int!) {
        postsCurrent(
          where: {
            groupId: {_in: $groupIds},
            isGroupContent: {_eq: true}
          },
          limit: $limit,
          offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) {
          ${POST_ROW_FIELDS}
        }
      }`,
      variables: { groupIds, limit, offset },
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
   * Recursive reply/quote tree for a group post by reference or full path.
   */
  threadTree(
    rootPath: string | GroupPostRef,
    opts: ThreadTreeOptions = {}
  ): Promise<ThreadTree> {
    return this._q.threads.treeByPath(groupPostPathValue(rootPath), opts);
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
    opts: { limit?: number; order?: 'asc' | 'desc' } = {}
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
    opts: {
      replyLimit?: number;
      quoteLimit?: number;
      /** Quote list direction; replies always read oldest-first. */
      quoteOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<GroupConversation> {
    const [root, replies, quotes] = await Promise.all([
      this.post(post),
      this.thread(post, { limit: opts.replyLimit }),
      this.quotes(post, { limit: opts.quoteLimit, order: opts.quoteOrder }),
    ]);
    return { root, replies, quotes };
  }
}
