import type { OnSocial, PostRow } from '@onsocial/sdk';
import {
  fetchIndexedGroupPostsByRefs,
  fetchIndexedPostsByRefs,
  indexedGroupPostRefKey,
  indexedPostRefKey,
} from '@/lib/fetch-personal-post';
import { parsePostPollEmbed, postKey } from '@/lib/post-display';
import {
  emptyPollTally,
  POLL_VOTE_DATA_TYPE,
  pollVoteStateKey,
  tallyPollVotes,
  type PollTally,
  type PollVoteRow,
} from '@/lib/poll-votes';
import {
  EMPTY_PROTOCOL_DAO_MEMBERSHIPS,
  type ProtocolDaoMemberships,
} from '@/lib/protocol-dao-memberships';

const GROUP_POST_PATH = /^([^/]+)\/groups\/([^/]+)\/content\/post\/(.+)$/;
const PERSONAL_POST_PATH = /^([^/]+)\/post\/(.+)$/;

export type FeedQuoteSeed = Record<string, PostRow | null>;

export function feedAuthorIds(
  posts: PostRow[],
  quoted: FeedQuoteSeed
): string[] {
  const ids = new Set<string>();
  for (const post of posts) {
    const id = post.accountId?.trim().toLowerCase();
    if (id) ids.add(id);
  }
  for (const post of Object.values(quoted)) {
    const id = post?.accountId?.trim().toLowerCase();
    if (id) ids.add(id);
  }
  return [...ids];
}

async function quotedByPaths(
  paths: string[],
  client: OnSocial
): Promise<FeedQuoteSeed> {
  const quoted: FeedQuoteSeed = {};
  const personal: Array<{ path: string; author: string; postId: string }> = [];
  const groups: Array<{
    path: string;
    author: string;
    groupId: string;
    postId: string;
  }> = [];
  for (const path of paths) {
    const group = GROUP_POST_PATH.exec(path);
    if (group) {
      groups.push({
        path,
        author: group[1]!,
        groupId: group[2]!,
        postId: group[3]!,
      });
      continue;
    }
    const personalMatch = !path.includes('/groups/')
      ? PERSONAL_POST_PATH.exec(path)
      : null;
    if (personalMatch) {
      personal.push({
        path,
        author: personalMatch[1]!,
        postId: personalMatch[2]!,
      });
      continue;
    }
    quoted[path] = null;
  }

  if (personal.length > 0) {
    const found = await fetchIndexedPostsByRefs(personal, client).catch(
      () => new Map<string, PostRow>()
    );
    for (const ref of personal) {
      quoted[ref.path] =
        found.get(indexedPostRefKey(ref.author, ref.postId)) ?? null;
    }
  }

  if (groups.length > 0) {
    const found = await fetchIndexedGroupPostsByRefs(groups, client).catch(
      () => new Map<string, PostRow>()
    );
    for (const ref of groups) {
      quoted[ref.path] =
        found.get(
          indexedGroupPostRefKey(ref.author, ref.groupId, ref.postId)
        ) ?? null;
    }
  }
  return quoted;
}

async function loadPollTallies(
  posts: PostRow[],
  client: OnSocial
): Promise<Record<string, PollTally>> {
  const polls = posts.flatMap((post) => {
    const poll = parsePostPollEmbed(post.value);
    if (!poll) return [];
    return [
      {
        key: postKey(post),
        owner: post.accountId,
        postId: post.postId,
        optionCount: poll.options.length,
      },
    ];
  });
  if (polls.length === 0) return {};

  const pathLikes = polls.map(
    (poll) => `%${POLL_VOTE_DATA_TYPE}/${poll.owner}/post/${poll.postId}`
  );
  const pathParams = pathLikes
    .map((_, index) => `$p${index}: String!`)
    .join(', ');
  const pathOr = pathLikes
    .map((_, index) => `{path: {_like: $p${index}}}`)
    .join(', ');
  let rows: PollVoteRow[] = [];
  try {
    const res = await client.query.graphql<{ dataUpdates: PollVoteRow[] }>({
      query: `query PollVotesForPosts($dataType: String!, $owners: [String!]!, ${pathParams}) {
        dataUpdates(
          where: {
            _and: [
              {dataType: {_eq: $dataType}}
              {targetAccount: {_in: $owners}}
              {_or: [${pathOr}]}
            ]
          }
          limit: 1000
          orderBy: [{blockHeight: DESC}]
        ) {
          path value accountId blockHeight operation
        }
      }`,
      variables: {
        dataType: POLL_VOTE_DATA_TYPE,
        owners: [...new Set(polls.map((poll) => poll.owner))],
        ...Object.fromEntries(
          pathLikes.map((path, index) => [`p${index}`, path])
        ),
      },
    });
    rows = res.data?.dataUpdates ?? [];
  } catch {
    rows = [];
  }

  const byState = tallyPollVotes(
    rows,
    polls.map((poll) => ({
      owner: poll.owner,
      postId: poll.postId,
      optionCount: poll.optionCount,
    })),
    null
  );
  const out: Record<string, PollTally> = {};
  for (const poll of polls) {
    out[poll.key] =
      byState[pollVoteStateKey(poll.owner, poll.postId)] ??
      emptyPollTally(poll.optionCount);
  }
  return out;
}

function countFromFeedValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function postFromFeedValue(
  value: PostRow | string | null | undefined
): PostRow | null {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as PostRow;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return value;
}

/** True when this page came back with the posts_feed paint columns. */
export function feedRowsIncludePublicCounts(posts: readonly PostRow[]): boolean {
  if (posts.length === 0) return false;
  return posts.every((post) => countFromFeedValue(post.replyCount) != null);
}

export type FeedPublicCounts = {
  replyCount: number;
  quoteCount: number;
  repostCount: number;
  reactionCount: number;
};

export function publicCountsOnFeedRow(
  post: PostRow | null | undefined
): FeedPublicCounts | null {
  if (!post) return null;
  const replyCount = countFromFeedValue(post.replyCount);
  if (replyCount == null) return null;
  return {
    replyCount,
    quoteCount: countFromFeedValue(post.quoteCount) ?? 0,
    repostCount: countFromFeedValue(post.repostCount) ?? 0,
    reactionCount: countFromFeedValue(post.reactionCount) ?? 0,
  };
}

/**
 * Quote bodies already on the feed rows. Null when the paint columns are
 * absent, so the caller keeps the quote read.
 */
export function quotedSeedFromFeedRows(
  posts: readonly PostRow[]
): FeedQuoteSeed | null {
  if (!feedRowsIncludePublicCounts(posts)) return null;
  const quoted: FeedQuoteSeed = {};
  const put = (path: string | null | undefined, row: PostRow | null) => {
    const key = path?.trim();
    if (!key || quoted[key]) return;
    quoted[key] = row;
  };
  for (const post of posts) {
    const quotedPost = postFromFeedValue(post.quotedPost);
    put(post.refPath, quotedPost);
    put(quotedPost?.refPath, postFromFeedValue(post.quotedRefPost));
  }
  return quoted;
}

/** Quotes for a page, including one hop through a repost. */
export async function loadFeedQuotes(
  posts: PostRow[],
  client: OnSocial
): Promise<FeedQuoteSeed> {
  const firstPaths = [
    ...new Set(
      posts
        .map((post) => post.refPath?.trim())
        .filter((path): path is string => Boolean(path))
    ),
  ];
  const first = await quotedByPaths(firstPaths, client);
  const secondPaths = [
    ...new Set(
      Object.values(first)
        .map((post) => post?.refPath?.trim())
        .filter((path): path is string => Boolean(path))
    ),
  ].filter((path) => !(path in first));
  const second = await quotedByPaths(secondPaths, client);
  return { ...second, ...first };
}

/** Poll tallies for a page. */
export async function loadFeedPollTallies(
  posts: PostRow[],
  client: OnSocial
): Promise<Record<string, PollTally>> {
  return loadPollTallies(posts, client);
}

/**
 * Media-decode fallback. Same 8s as `FEED_MEDIA_RESOLVE_FALLBACK_MS` in
 * post-media.tsx. That export lives in a client module, so a server loader
 * that imports it receives a function and a timer fires immediately. The
 * paint-cap test locks the two numbers together. The home list uses
 * `FEED_REVEAL_BUDGET_MS` instead.
 */
export const FEED_SIDE_PAINT_CAP_MS = 8_000;

/**
 * How long quote, tally, and dao-role reads may hold the home list.
 * A cold dao-roles batch on this production build against testnet measured
 * 1.622s at the worst of ten process restarts (p50 1.543s). 2.5s sits above
 * that worst and well under the 8s media-decode fallback, so one hung read
 * cannot hold first paint for the media cap. `FEED_SIDE_PAINT_CAP_MS` stays
 * the media fallback only.
 */
export const FEED_REVEAL_BUDGET_MS = 2_500;

/** Authors missing from a timed-out dao read get an empty seed, so no badge mounts later. */
export function seedDaoMembershipMisses(
  accountIds: readonly string[],
  memberships: Record<string, ProtocolDaoMemberships>
): Record<string, ProtocolDaoMemberships> {
  let next: Record<string, ProtocolDaoMemberships> | null = null;
  for (const id of accountIds) {
    if (Object.prototype.hasOwnProperty.call(memberships, id)) continue;
    next ??= { ...memberships };
    next[id] = EMPTY_PROTOCOL_DAO_MEMBERSHIPS;
  }
  return next ?? memberships;
}

/**
 * Quote hops finish before poll tallies start. Both reads share one
 * OnSocial client. The cap timers in `settleFeedSidePaint` still start
 * together, so the pair cannot hold the list past one cap.
 */
export function sequenceFeedQuoteThenTally(
  quotes: Promise<FeedQuoteSeed>,
  tallies: () => Promise<Record<string, PollTally>>
): {
  quotes: Promise<FeedQuoteSeed>;
  tallies: Promise<Record<string, PollTally>>;
} {
  return {
    quotes,
    tallies: quotes.then(() => tallies()),
  };
}

/**
 * Resolve `task`, or `fallback` if it rejects or is still pending when `ms`
 * elapses. The home reveal passes `FEED_REVEAL_BUDGET_MS`. The 8s
 * `FEED_SIDE_PAINT_CAP_MS` stays paired with the media-decode fallback.
 */
export function capFeedTask<T>(
  task: Promise<T> | ((signal: AbortSignal) => Promise<T>),
  fallback: T,
  ms: number
): Promise<T> {
  const controller = new AbortController();
  const started = typeof task === 'function' ? task(controller.signal) : task;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      controller.abort();
      resolve(fallback);
    }, ms);
    const finish = (value: T) => {
      clearTimeout(timer);
      resolve(value);
    };
    started.then(finish, () => finish(fallback));
  });
}

export async function settleFeedSidePaint(args: {
  quotes: Promise<FeedQuoteSeed>;
  tallies: Promise<Record<string, PollTally>>;
  memberships:
    | Promise<Record<string, ProtocolDaoMemberships>>
    | ((signal: AbortSignal) => Promise<Record<string, ProtocolDaoMemberships>>);
  /** `FEED_SIDE_PAINT_CAP_MS`. */
  capMs: number;
}): Promise<{
  quoted: FeedQuoteSeed;
  tallies: Record<string, PollTally>;
  memberships: Record<string, ProtocolDaoMemberships>;
}> {
  const [quoted, tallies, memberships] = await Promise.all([
    capFeedTask(args.quotes, {}, args.capMs),
    capFeedTask(args.tallies, {}, args.capMs),
    capFeedTask(args.memberships, {}, args.capMs),
  ]);
  return { quoted, tallies, memberships };
}
