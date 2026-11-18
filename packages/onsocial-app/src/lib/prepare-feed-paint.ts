import type { OnSocial, PostRow } from '@onsocial/sdk';
import {
  fetchIndexedPostsByRefs,
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

  await Promise.all(
    groups.map(async (ref) => {
      try {
        quoted[ref.path] =
          (await client.query.groups.post({
            author: ref.author,
            groupId: ref.groupId,
            postId: ref.postId,
          })) ?? null;
      } catch {
        quoted[ref.path] = null;
      }
    })
  );
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

/** Quotes (including one hop through a repost) and poll tallies for a page. */
export async function prepareFeedQuotesAndPolls(
  posts: PostRow[],
  client: OnSocial
): Promise<{ quoted: FeedQuoteSeed; tallies: Record<string, PollTally> }> {
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
  const [quoted, tallies] = await Promise.all([
    Promise.resolve({ ...second, ...first }),
    loadPollTallies(posts, client),
  ]);
  return { quoted, tallies };
}
