'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  emptyPollTally,
  parsePollVoteValue,
  POLL_VOTE_DATA_TYPE,
  pollVoteStateKey,
  pollVoteWritePath,
  tallyPollVotes,
  type PollTally,
  type PollVoteRow,
} from '@/lib/poll-votes';
import { parsePostPollEmbed, postKey } from '@/lib/post-display';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface PollVoteMap {
  [key: string]: PollTally;
}

/**
 * Load + cast poll votes for visible posts. Votes live at
 * `pollvote/<owner>/post/<postId>` (one path per voter; overwrite = change).
 * Feedback matches reactions: optimistic UI, errors only.
 */
export function usePollVotes(
  posts: PostRow[],
  opts: { onError?: (message: string) => void } = {}
) {
  const { accountId, isConnected, connect } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const [tallies, setTallies] = useState<PollVoteMap>({});
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(() => new Set());
  const loadIdRef = useRef(0);
  const onErrorRef = useRef(opts.onError);
  onErrorRef.current = opts.onError;

  const pollTargets = useMemo(() => {
    const targets: {
      key: string;
      owner: string;
      postId: string;
      optionCount: number;
    }[] = [];
    for (const post of posts) {
      const poll = parsePostPollEmbed(post.value);
      if (!poll) continue;
      targets.push({
        key: postKey(post),
        owner: post.accountId,
        postId: post.postId,
        optionCount: poll.options.length,
      });
    }
    return targets;
  }, [posts]);

  const targetsSignature = useMemo(
    () =>
      pollTargets
        .map((t) => `${t.owner}:${t.postId}:${t.optionCount}`)
        .join('\n') + `\n@${accountId ?? ''}`,
    [pollTargets, accountId]
  );

  useEffect(() => {
    if (pollTargets.length === 0) {
      setTallies({});
      return;
    }

    const loadId = ++loadIdRef.current;
    const client = createReadOnlyOnSocialClient();
    const owners = [...new Set(pollTargets.map((t) => t.owner))];
    const wantedKeys = new Set(
      pollTargets.map((t) => pollVoteStateKey(t.owner, t.postId))
    );
    // Suffix-match the visible polls' vote paths server-side (rows may or may
    // not carry the voter prefix, so match on `pollvote/<owner>/post/<id>`).
    // The client-side wantedKeys filter stays as the exact gate — LIKE treats
    // `_` in account ids as a wildcard, so the server filter is a superset.
    const pathLikes = pollTargets.map(
      (t) => `%${POLL_VOTE_DATA_TYPE}/${t.owner}/post/${t.postId}`
    );
    const pathParams = pathLikes.map((_, i) => `$p${i}: String!`).join(', ');
    const pathOr = pathLikes
      .map((_, i) => `{path: {_like: $p${i}}}`)
      .join(', ');

    const loadIndexed = client.query
      .graphql<{
        dataUpdates: PollVoteRow[];
      }>({
        // Prefer targetAccount (post owner) — avoids invalid GraphQL escapes
        // that broke inline path `_regex` with `\.` in account ids.
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
          owners,
          ...Object.fromEntries(pathLikes.map((p, i) => [`p${i}`, p])),
        },
      })
      .then((res) => res.data?.dataUpdates ?? [])
      .catch(() => [] as PollVoteRow[]);

    const loadViewerOnChain = accountId
      ? client.social
          .get(
            pollTargets.map((t) => pollVoteWritePath(t.owner, t.postId)),
            accountId
          )
          .catch(() => [])
      : Promise.resolve([]);

    void Promise.all([loadIndexed, loadViewerOnChain]).then(
      ([rows, viewerEntries]) => {
        if (loadIdRef.current !== loadId) return;

        const next = tallyPollVotes(
          rows,
          pollTargets.map((t) => ({
            owner: t.owner,
            postId: t.postId,
            optionCount: t.optionCount,
          })),
          accountId
        );

        // Drop votes for polls not on this page (same owner, other posts).
        for (const key of Object.keys(next)) {
          if (!wantedKeys.has(key)) delete next[key];
        }

        // Chain is source of truth for "what I voted" (no indexer lag).
        if (accountId && Array.isArray(viewerEntries)) {
          const byKey = new Map(
            viewerEntries.map((entry) => [entry.requested_key, entry])
          );
          for (const target of pollTargets) {
            const entry = byKey.get(
              pollVoteWritePath(target.owner, target.postId)
            );
            if (!entry || entry.deleted) continue;
            const vote = parsePollVoteValue(entry.value);
            if (!vote || vote.optionIndex >= target.optionCount) continue;
            const stateKey = pollVoteStateKey(target.owner, target.postId);
            const tally = next[stateKey] ?? emptyPollTally(target.optionCount);
            if (tally.viewerOptionIndex == null) {
              // Indexer hasn't caught up — count the on-chain vote once.
              tally.counts[vote.optionIndex] =
                (tally.counts[vote.optionIndex] ?? 0) + 1;
              tally.total += 1;
            }
            tally.viewerOptionIndex = vote.optionIndex;
            next[stateKey] = tally;
          }
        }

        const byCardKey: PollVoteMap = {};
        for (const target of pollTargets) {
          byCardKey[target.key] =
            next[pollVoteStateKey(target.owner, target.postId)] ??
            emptyPollTally(target.optionCount);
        }
        setTallies(byCardKey);
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetsSignature]);

  const castVote = useCallback(
    async (post: PostRow, optionIndex: number) => {
      const key = postKey(post);
      const poll = parsePostPollEmbed(post.value);
      if (!poll || pendingKeys.has(key)) return;
      if (optionIndex < 0 || optionIndex >= poll.options.length) return;
      if (poll.closesAt != null && poll.closesAt <= Date.now()) return;

      if (!isConnected || !accountId) {
        await connect();
        return;
      }

      const previous = tallies[key] ?? emptyPollTally(poll.options.length);
      const previousIndex = previous.viewerOptionIndex;

      // Same option again — no-op (already voted).
      if (previousIndex === optionIndex) return;

      const nextCounts = [...previous.counts];
      if (previousIndex != null && previousIndex < nextCounts.length) {
        nextCounts[previousIndex] = Math.max(0, nextCounts[previousIndex] - 1);
      }
      nextCounts[optionIndex] = (nextCounts[optionIndex] ?? 0) + 1;
      const nextTotal =
        previousIndex == null ? previous.total + 1 : previous.total;

      setPendingKeys((current) => new Set(current).add(key));
      setTallies((current) => ({
        ...current,
        [key]: {
          counts: nextCounts,
          total: nextTotal,
          viewerOptionIndex: optionIndex,
        },
      }));

      try {
        const { client } = await getClient();
        await client.social.set(pollVoteWritePath(post.accountId, post.postId), {
          v: 1,
          optionIndex,
          timestamp: Date.now(),
        });
      } catch (cause) {
        setTallies((current) => ({ ...current, [key]: previous }));
        if (!isWalletUserCancellation(cause)) {
          onErrorRef.current?.(
            cause instanceof Error ? cause.message : 'Could not cast vote.'
          );
        }
      } finally {
        setPendingKeys((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    },
    [accountId, connect, getClient, isConnected, pendingKeys, tallies]
  );

  const pollTallyFor = useCallback(
    (post: PostRow) => tallies[postKey(post)],
    [tallies]
  );

  const isPollVotePending = useCallback(
    (post: PostRow) => pendingKeys.has(postKey(post)),
    [pendingKeys]
  );

  return { pollTallyFor, castVote, isPollVotePending, tallies };
}
