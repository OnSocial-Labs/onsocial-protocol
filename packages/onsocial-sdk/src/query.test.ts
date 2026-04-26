import { describe, it, expect, vi } from 'vitest';
import { OnSocial } from './client.js';

// ── Stub fetch ─────────────────────────────────────────────────────────────

function stubFetch(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function makeOs(body: unknown) {
  const fetch = stubFetch(body);
  const os = new OnSocial({
    gatewayUrl: 'https://g.test',
    fetch,
    apiKey: 'test-key',
  });
  return { os, fetch };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('QueryModule', () => {
  // The single-purpose raw GraphQL helpers (`profile()`, `posts()`,
  // `standingCounts()`, `reactions()`, `edgeCounts()`) were dropped in the
  // sub-namespace refactor. The typed sub-namespace methods below
  // (`profiles.get`, `feed.recent`, `standings.counts`, `stats.edges`, etc.)
  // are now the canonical accessors. Use `os.query.graphql({...})` for
  // anything else.

  // ── Typed read helpers ─────────────────────────────────────────────────

  describe('getProfile()', () => {
    it('merges profile rows into field→value map', async () => {
      const { os } = makeOs({
        data: {
          profilesCurrent: [
            {
              accountId: 'a.near',
              field: 'name',
              value: '{"v":1,"displayName":"Alice"}',
              blockHeight: 1,
              blockTimestamp: 2,
              operation: 'set',
            },
            {
              accountId: 'a.near',
              field: 'avatar',
              value: '{"v":1,"cid":"Qm..."}',
              blockHeight: 1,
              blockTimestamp: 2,
              operation: 'set',
            },
          ],
        },
      });

      const profile = await os.query.profiles.get('a.near');
      expect(profile).toEqual({
        name: '{"v":1,"displayName":"Alice"}',
        avatar: '{"v":1,"cid":"Qm..."}',
      });
    });

    it('returns null for unknown account', async () => {
      const { os } = makeOs({ data: { profilesCurrent: [] } });
      expect(await os.query.profiles.get('ghost.near')).toBeNull();
    });
  });

  describe('getPosts()', () => {
    it('returns paginated result with nextOffset', async () => {
      const rows = Array.from({ length: 20 }, (_, i) => ({
        accountId: 'a.near',
        postId: `p${i}`,
        value: '{}',
        blockHeight: 100 - i,
        blockTimestamp: 0,
      }));
      const { os } = makeOs({ data: { postsCurrent: rows } });

      const page = await os.query.feed.recent({ limit: 20 });
      expect(page.items).toHaveLength(20);
      expect(page.nextOffset).toBe(20);
    });

    it('returns undefined nextOffset on last page', async () => {
      const { os } = makeOs({
        data: {
          postsCurrent: [
            {
              accountId: 'a.near',
              postId: 'p1',
              value: '{}',
              blockHeight: 1,
              blockTimestamp: 0,
            },
          ],
        },
      });

      const page = await os.query.feed.recent({ limit: 20 });
      expect(page.items).toHaveLength(1);
      expect(page.nextOffset).toBeUndefined();
    });
  });

  describe('getFeed()', () => {
    it('queries posts for standing-with accounts', async () => {
      const { os, fetch } = makeOs({
        data: {
          postsCurrent: [
            {
              accountId: 'bob.near',
              postId: 'p1',
              value: '{}',
              blockHeight: 1,
              blockTimestamp: 0,
            },
          ],
        },
      });

      const page = await os.query.feed.fromAccounts({
        accounts: ['bob.near', 'carol.near'],
        limit: 10,
      });

      expect(page.items).toHaveLength(1);
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.query).toContain('_in: $accounts');
      expect(body.variables.accounts).toEqual(['bob.near', 'carol.near']);
    });

    it('returns empty for empty standing list', async () => {
      const { os, fetch } = makeOs({ data: { postsCurrent: [] } });
      const page = await os.query.feed.fromAccounts({ accounts: [] });
      expect(page.items).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('getFilteredFeed()', () => {
    it('queries postsCurrent with server-side channel and kind filtering', async () => {
      const { os, fetch } = makeOs({
        data: {
          postsCurrent: [
            {
              accountId: 'bob.near',
              postId: 'p1',
              value: '{}',
              blockHeight: 1,
              blockTimestamp: 0,
              channel: 'engineering',
              kind: 'announcement',
            },
          ],
        },
      });

      const page = await os.query.feed.fromAccountsFiltered({
        accounts: ['bob.near', 'carol.near'],
        channel: 'engineering',
        kind: 'announcement',
        limit: 10,
      });

      expect(page.items).toHaveLength(1);
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.query).toContain('accountId: {_in: $accounts}');
      expect(body.query).toContain('channel: {_eq: $channel}');
      expect(body.query).toContain('kind: {_eq: $kind}');
      expect(body.variables.accounts).toEqual(['bob.near', 'carol.near']);
      expect(body.variables.channel).toBe('engineering');
      expect(body.variables.kind).toBe('announcement');
    });

    it('queries postsCurrent with server-side audience filtering', async () => {
      const { os, fetch } = makeOs({
        data: {
          postsCurrent: [
            {
              accountId: 'bob.near',
              postId: 'p1',
              value: '{}',
              blockHeight: 1,
              blockTimestamp: 0,
              audiences: '|members|employees|',
            },
          ],
        },
      });

      const page = await os.query.feed.fromAccountsFiltered({
        accounts: ['bob.near'],
        audience: 'employees',
        limit: 10,
      });

      expect(page.items).toHaveLength(1);
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.query).toContain('audiences: {_like: $audienceLike}');
      expect(body.variables.audienceLike).toBe('%|employees|%');
    });

    it('returns empty for empty standing list', async () => {
      const { os, fetch } = makeOs({ data: { postsCurrent: [] } });
      const page = await os.query.feed.fromAccountsFiltered({ accounts: [] });
      expect(page.items).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('getGroupFeed()', () => {
    it('queries group-scoped posts with isGroupContent filtering', async () => {
      const { os, fetch } = makeOs({
        data: {
          postsCurrent: [
            {
              accountId: 'bob.near',
              postId: 'g1',
              value: '{}',
              blockHeight: 1,
              blockTimestamp: 0,
              channel: 'engineering',
              kind: 'announcement',
              groupId: 'dao',
              isGroupContent: true,
            },
          ],
        },
      });

      const page = await os.query.groups.feed({ groupId: 'dao', limit: 5 });
      expect(page.items).toHaveLength(1);
      expect(page.items[0].groupId).toBe('dao');
      expect(page.items[0].channel).toBe('engineering');
      expect(page.items[0].kind).toBe('announcement');

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.query).toContain('groupId: {_eq: $groupId}');
      expect(body.query).toContain('isGroupContent: {_eq: true}');
      expect(body.query).toContain('channel kind');
      expect(body.variables.groupId).toBe('dao');
    });
  });

  describe('getFilteredGroupFeed()', () => {
    it('filters canonical group posts by channel and kind metadata', async () => {
      const { os, fetch } = makeOs({
        data: {
          postsCurrent: [
            {
              accountId: 'alice.near',
              postId: 'g1',
              value:
                '{"text":"one","channel":"engineering","kind":"announcement","audiences":["members"]}',
              blockHeight: 3,
              blockTimestamp: 0,
              groupId: 'dao',
              isGroupContent: true,
            },
          ],
        },
      });

      const page = await os.query.groups.feedFiltered({
        groupId: 'dao',
        channel: 'engineering',
        kind: 'announcement',
      });

      expect(page.items).toHaveLength(1);
      expect(page.items[0].postId).toBe('g1');
      expect(fetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.query).toContain('channel: {_eq: $channel}');
      expect(body.query).toContain('kind: {_eq: $kind}');
      expect(body.variables.channel).toBe('engineering');
      expect(body.variables.kind).toBe('announcement');
    });

    it('filters canonical group posts by audience metadata', async () => {
      const { os, fetch } = makeOs({
        data: {
          postsCurrent: [
            {
              accountId: 'alice.near',
              postId: 'g1',
              value: '{"text":"one","audiences":["members","employees"]}',
              blockHeight: 2,
              blockTimestamp: 0,
              audiences: '|members|employees|',
              groupId: 'dao',
              isGroupContent: true,
            },
          ],
        },
      });

      const page = await os.query.groups.feedFiltered({
        groupId: 'dao',
        audience: 'employees',
      });

      expect(page.items).toHaveLength(1);
      expect(page.items[0].postId).toBe('g1');
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.query).toContain('audiences: {_like: $audienceLike}');
      expect(body.variables.audienceLike).toBe('%|employees|%');
    });
  });

  describe('getGroupPost()', () => {
    it('queries a single group post by typed reference', async () => {
      const { os, fetch } = makeOs({
        data: {
          postsCurrent: [
            {
              accountId: 'alice.near',
              postId: 'root',
              value: '{}',
              blockHeight: 10,
              blockTimestamp: 20,
              groupId: 'dao',
              isGroupContent: true,
            },
          ],
        },
      });

      const post = await os.query.groups.post({
        author: 'alice.near',
        groupId: 'dao',
        postId: 'root',
      });

      expect(post?.accountId).toBe('alice.near');
      expect(post?.groupId).toBe('dao');
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.accountId).toBe('alice.near');
      expect(body.variables.groupId).toBe('dao');
      expect(body.variables.postId).toBe('root');
    });
  });

  describe('getReplies()', () => {
    it('queries threadReplies and normalises to PostRow', async () => {
      const { os, fetch } = makeOs({
        data: {
          threadReplies: [
            {
              replyAuthor: 'bob.near',
              replyId: 'r1',
              value: '{"v":1,"text":"reply"}',
              blockHeight: 10,
              blockTimestamp: 20,
              groupId: null,
              parentAuthor: 'alice.near',
              parentPath: 'post/p1',
              parentType: 'post',
            },
          ],
        },
      });

      const replies = await os.query.threads.replies('alice.near', 'p1');
      expect(replies).toHaveLength(1);
      expect(replies[0].accountId).toBe('bob.near');
      expect(replies[0].postId).toBe('r1');
      expect(replies[0].parentAuthor).toBe('alice.near');

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.parentPath).toBe('alice.near/post/p1');
    });
  });

  describe('getQuotes()', () => {
    it('queries quotes view and normalises to PostRow', async () => {
      const { os, fetch } = makeOs({
        data: {
          quotes: [
            {
              quoteAuthor: 'carol.near',
              quoteId: 'q1',
              value: '{"v":1,"text":"quote"}',
              blockHeight: 10,
              blockTimestamp: 20,
              groupId: null,
              refAuthor: 'alice.near',
              refPath: 'post/p1',
              refType: 'quote',
            },
          ],
        },
      });

      const quotes = await os.query.threads.quotes('alice.near', 'p1');
      expect(quotes).toHaveLength(1);
      expect(quotes[0].accountId).toBe('carol.near');
      expect(quotes[0].refAuthor).toBe('alice.near');

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.refPath).toBe('alice.near/post/p1');
    });
  });

  describe('getRepliesByPath()', () => {
    it('queries threadReplies using the full parent path', async () => {
      const { os, fetch } = makeOs({
        data: {
          threadReplies: [
            {
              replyAuthor: 'bob.near',
              replyId: 'r1',
              value: '{"v":1,"text":"reply"}',
              blockHeight: 10,
              blockTimestamp: 20,
              groupId: 'dao',
              parentAuthor: 'alice.near',
              parentPath: 'alice.near/groups/dao/content/post/root',
              parentType: 'post',
            },
          ],
        },
      });

      const replies = await os.query.threads.repliesByPath(
        'alice.near/groups/dao/content/post/root'
      );
      expect(replies).toHaveLength(1);
      expect(replies[0].parentPath).toBe(
        'alice.near/groups/dao/content/post/root'
      );

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.parentAuthor).toBe('alice.near');
      expect(body.variables.parentPath).toBe(
        'alice.near/groups/dao/content/post/root'
      );
    });
  });

  describe('getGroupThread()', () => {
    it('delegates to the full-path thread query for group posts', async () => {
      const { os, fetch } = makeOs({
        data: {
          threadReplies: [
            {
              replyAuthor: 'bob.near',
              replyId: 'r1',
              value: '{"v":1,"text":"reply"}',
              blockHeight: 10,
              blockTimestamp: 20,
              groupId: 'dao',
              parentAuthor: 'alice.near',
              parentPath: 'alice.near/groups/dao/content/post/root',
              parentType: 'post',
            },
          ],
        },
      });

      const replies = await os.query.groups.thread(
        'alice.near/groups/dao/content/post/root'
      );

      expect(replies).toHaveLength(1);
      expect(replies[0].groupId).toBe('dao');
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.parentPath).toBe(
        'alice.near/groups/dao/content/post/root'
      );
    });

    it('accepts a typed GroupPostRef', async () => {
      const { os, fetch } = makeOs({ data: { threadReplies: [] } });

      await os.query.groups.thread({
        author: 'alice.near',
        groupId: 'dao',
        postId: 'root',
      });

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.parentPath).toBe(
        'alice.near/groups/dao/content/post/root'
      );
    });
  });

  describe('getQuotesByPath()', () => {
    it('queries quotes using the full ref path', async () => {
      const { os, fetch } = makeOs({
        data: {
          quotes: [
            {
              quoteAuthor: 'carol.near',
              quoteId: 'q1',
              value: '{"v":1,"text":"quote"}',
              blockHeight: 10,
              blockTimestamp: 20,
              groupId: 'dao',
              refAuthor: 'alice.near',
              refPath: 'alice.near/groups/dao/content/post/root',
              refType: 'quote',
            },
          ],
        },
      });

      const quotes = await os.query.threads.quotesByPath(
        'alice.near/groups/dao/content/post/root'
      );
      expect(quotes).toHaveLength(1);
      expect(quotes[0].refPath).toBe('alice.near/groups/dao/content/post/root');

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.refAuthor).toBe('alice.near');
      expect(body.variables.refPath).toBe(
        'alice.near/groups/dao/content/post/root'
      );
    });
  });

  describe('getQuotesForGroupPost()', () => {
    it('accepts a typed GroupPostRef', async () => {
      const { os, fetch } = makeOs({ data: { quotes: [] } });

      await os.query.groups.quotes({
        author: 'alice.near',
        groupId: 'dao',
        postId: 'root',
      });

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.refPath).toBe(
        'alice.near/groups/dao/content/post/root'
      );
      expect(body.variables.refAuthor).toBe('alice.near');
    });
  });

  describe('getGroupConversation()', () => {
    it('returns root, replies, and quotes together', async () => {
      const { os } = makeOs({
        data: {
          postsCurrent: [
            {
              accountId: 'alice.near',
              postId: 'root',
              value: '{}',
              blockHeight: 10,
              blockTimestamp: 20,
              groupId: 'dao',
              isGroupContent: true,
            },
          ],
          threadReplies: [
            {
              replyAuthor: 'bob.near',
              replyId: 'r1',
              value: '{"v":1}',
              blockHeight: 11,
              blockTimestamp: 21,
              groupId: 'dao',
              parentAuthor: 'alice.near',
              parentPath: 'alice.near/groups/dao/content/post/root',
              parentType: 'post',
            },
          ],
          quotes: [
            {
              quoteAuthor: 'carol.near',
              quoteId: 'q1',
              value: '{"v":1}',
              blockHeight: 12,
              blockTimestamp: 22,
              groupId: 'dao',
              refAuthor: 'alice.near',
              refPath: 'alice.near/groups/dao/content/post/root',
              refType: 'quote',
            },
          ],
        },
      });

      const conversation = await os.query.groups.conversation({
        author: 'alice.near',
        groupId: 'dao',
        postId: 'root',
      });

      expect(conversation.root?.postId).toBe('root');
      expect(conversation.replies).toHaveLength(1);
      expect(conversation.replies[0].postId).toBe('r1');
      expect(conversation.quotes).toHaveLength(1);
      expect(conversation.quotes[0].postId).toBe('q1');
    });
  });

  describe('getReactionCounts()', () => {
    it('returns total count', async () => {
      const { os } = makeOs({
        data: {
          reactionCounts: [{ reactionKind: 'like', reactionCount: 7 }],
        },
      });

      const counts = await os.query.reactions.counts('alice.near', 'post/p1');
      expect(counts).toEqual({ like: 7, total: 7 });
    });

    it('returns only total when no reactions', async () => {
      const { os } = makeOs({ data: { reactionCounts: [] } });
      expect(await os.query.reactions.counts('a.near', 'post/x')).toEqual({
        total: 0,
      });
    });
  });

  describe('getStandingWith()', () => {
    it('returns target account IDs', async () => {
      const { os } = makeOs({
        data: {
          standingsCurrent: [
            {
              accountId: 'a.near',
              targetAccount: 'bob.near',
              value: '{}',
              blockHeight: 1,
              blockTimestamp: 0,
            },
            {
              accountId: 'a.near',
              targetAccount: 'carol.near',
              value: '{}',
              blockHeight: 1,
              blockTimestamp: 0,
            },
          ],
        },
      });

      const result = await os.query.standings.outgoing('a.near');
      expect(result).toEqual(['bob.near', 'carol.near']);
    });
  });

  describe('getStanders()', () => {
    it('returns source account IDs (inbound)', async () => {
      const { os, fetch } = makeOs({
        data: {
          standingsCurrent: [
            { accountId: 'dave.near', targetAccount: 'a.near' },
            { accountId: 'eve.near', targetAccount: 'a.near' },
          ],
        },
      });

      const result = await os.query.standings.incoming('a.near');
      expect(result).toEqual(['dave.near', 'eve.near']);

      // Queries by targetAccount (inbound), not accountId
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.query).toContain('targetAccount: {_eq: $id}');
    });
  });

  describe('getStandingCounts()', () => {
    it('returns parsed numeric counts', async () => {
      const { os } = makeOs({
        data: {
          standingCounts: [
            {
              accountId: 'a.near',
              standingWithCount: 42,
              lastStandingBlock: 99,
            },
          ],
          standingOutCounts: [
            {
              accountId: 'a.near',
              standingWithOthersCount: 7,
              lastStandingBlock: 99,
            },
          ],
        },
      });

      const counts = await os.query.standings.counts('a.near');
      expect(counts).toEqual({ incoming: 42, outgoing: 7 });
    });

    it('returns zeros when no data', async () => {
      const { os } = makeOs({
        data: { standingCounts: [], standingOutCounts: [] },
      });
      expect(await os.query.standings.counts('ghost.near')).toEqual({
        incoming: 0,
        outgoing: 0,
      });
    });
  });

  // ── Hashtags ───────────────────────────────────────────────────────────

  describe('getPostsByHashtag()', () => {
    it('queries postHashtags by tag, newest first', async () => {
      const { os, fetch } = makeOs({
        data: {
          postHashtags: [
            {
              accountId: 'alice.near',
              postId: 'p1',
              hashtag: 'onchain',
              blockHeight: 100,
              blockTimestamp: 1,
              groupId: null,
            },
            {
              accountId: 'bob.near',
              postId: 'p2',
              hashtag: 'onchain',
              blockHeight: 99,
              blockTimestamp: 2,
              groupId: null,
            },
          ],
        },
      });

      const page = await os.query.feed.byHashtag('#onchain', { limit: 10 });
      expect(page.items).toHaveLength(2);
      expect(page.items[0].accountId).toBe('alice.near');
      expect(page.items[0].postId).toBe('p1');

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.tag).toBe('onchain'); // stripped #
      expect(body.query).toContain('blockHeight: DESC');
    });

    it('returns nextOffset when page is full', async () => {
      const rows = Array.from({ length: 5 }, (_, i) => ({
        accountId: 'a.near',
        postId: `p${i}`,
        hashtag: 'gm',
        blockHeight: 100 - i,
        blockTimestamp: 0,
        groupId: null,
      }));
      const { os } = makeOs({ data: { postHashtags: rows } });

      const page = await os.query.feed.byHashtag('gm', { limit: 5 });
      expect(page.nextOffset).toBe(5);
    });

    it('returns no nextOffset on last page', async () => {
      const { os } = makeOs({
        data: {
          postHashtags: [
            {
              accountId: 'a.near',
              postId: 'p1',
              hashtag: 'gm',
              blockHeight: 1,
              blockTimestamp: 0,
              groupId: null,
            },
          ],
        },
      });

      const page = await os.query.feed.byHashtag('gm', { limit: 20 });
      expect(page.nextOffset).toBeUndefined();
    });
  });

  describe('getTrendingHashtags()', () => {
    it('returns hashtags ordered by postCount', async () => {
      const { os, fetch } = makeOs({
        data: {
          hashtagCounts: [
            { hashtag: 'onchain', postCount: 42, lastBlock: 100 },
            { hashtag: 'gm', postCount: 10, lastBlock: 99 },
          ],
        },
      });

      const tags = await os.query.hashtags.trending({ limit: 10 });
      expect(tags).toHaveLength(2);
      expect(tags[0].hashtag).toBe('onchain');
      expect(tags[0].postCount).toBe(42);

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.query).toContain('postCount: DESC');
    });

    it('returns empty array when no hashtags', async () => {
      const { os } = makeOs({ data: { hashtagCounts: [] } });
      expect(await os.query.hashtags.trending()).toEqual([]);
    });
  });

  describe('searchHashtags()', () => {
    it('searches by prefix with _like', async () => {
      const { os, fetch } = makeOs({
        data: {
          hashtagCounts: [
            { hashtag: 'onchain', postCount: 42, lastBlock: 100 },
            { hashtag: 'onsocial', postCount: 5, lastBlock: 90 },
          ],
        },
      });

      const results = await os.query.hashtags.search('#on', { limit: 5 });
      expect(results).toHaveLength(2);

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.prefix).toBe('on%'); // stripped # + appended %
      expect(body.query).toContain('_like: $prefix');
    });
  });

  describe('graphql() error surfacing', () => {
    it('throws GraphQLValidationError when errors present and data is null', async () => {
      const { os } = makeOs({
        data: null,
        errors: [
          {
            message: "field 'channel' not found in type: 'PostsCurrent'",
            extensions: { code: 'validation-failed' },
          },
        ],
      });

      await expect(
        os.query.graphql({ query: '{ postsCurrent { channel } }' })
      ).rejects.toThrow(/field 'channel' not found/);
    });

    it('does not throw when partial data is returned alongside errors', async () => {
      const { os } = makeOs({
        data: { postsCurrent: [] },
        errors: [{ message: 'partial nullability warning' }],
      });

      const res = await os.query.graphql({
        query: '{ postsCurrent { postId } }',
      });
      expect(res.errors).toHaveLength(1);
      expect(res.data).toEqual({ postsCurrent: [] });
    });
  });

  describe('storage.*', () => {
    const sampleEvent = {
      operation: 'tip',
      actorId: 'a.near',
      targetId: 'b.near',
      amount: '1000',
      blockHeight: 1,
      blockTimestamp: 2,
      groupId: null,
      poolId: null,
      reason: null,
    };

    it('tipsSent filters by operation=tip and actorId, returning rows', async () => {
      const { os, fetch } = makeOs({
        data: { storageUpdates: [sampleEvent] },
      });
      const rows = await os.query.storage.tipsSent('a.near', { limit: 10 });
      expect(rows).toEqual([sampleEvent]);

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({ id: 'a.near', limit: 10 });
      expect(body.query).toMatch(/operation: \{_eq: "tip"\}/);
      expect(body.query).toMatch(/actorId: \{_eq: \$id\}/);
    });

    it('tipsReceived filters by targetId', async () => {
      const { os, fetch } = makeOs({
        data: { storageUpdates: [sampleEvent] },
      });
      const rows = await os.query.storage.tipsReceived('b.near');
      expect(rows).toEqual([sampleEvent]);

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({ id: 'b.near', limit: 50 });
      expect(body.query).toMatch(/targetId: \{_eq: \$id\}/);
    });

    it('history queries actor OR target', async () => {
      const { os, fetch } = makeOs({
        data: { storageUpdates: [sampleEvent] },
      });
      await os.query.storage.history('a.near');

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.query).toMatch(/_or:/);
      expect(body.query).toMatch(/actorId: \{_eq: \$id\}/);
      expect(body.query).toMatch(/targetId: \{_eq: \$id\}/);
    });

    it('byOperation filters by arbitrary operation string', async () => {
      const { os, fetch } = makeOs({
        data: { storageUpdates: [{ ...sampleEvent, operation: 'withdraw' }] },
      });
      const rows = await os.query.storage.byOperation('withdraw', { limit: 5 });
      expect(rows[0].operation).toBe('withdraw');

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({ op: 'withdraw', limit: 5 });
    });

    it('returns [] when the indexer has no matching rows', async () => {
      const { os } = makeOs({ data: { storageUpdates: [] } });
      expect(await os.query.storage.tipsSent('nobody.near')).toEqual([]);
    });
  });

  describe('permissions.*', () => {
    const sampleEvent = {
      operation: 'grant',
      author: 'a.near',
      targetId: 'b.near',
      path: 'a.near/profile/',
      level: 1,
      deleted: false,
      blockHeight: 1,
      blockTimestamp: 2,
    };

    it('grantsBy filters by author and grant operations', async () => {
      const { os, fetch } = makeOs({
        data: { permissionUpdates: [sampleEvent] },
      });
      const rows = await os.query.permissions.grantsBy('a.near', { limit: 10 });
      expect(rows).toEqual([sampleEvent]);

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({
        id: 'a.near',
        ops: ['grant', 'grant_key', 'key_grant'],
        limit: 10,
      });
      expect(body.query).toMatch(/author: \{_eq: \$id\}/);
      expect(body.query).toMatch(/operation: \{_in: \$ops\}/);
    });

    it('grantsTo filters by targetId with account-grant ops only', async () => {
      const { os, fetch } = makeOs({
        data: { permissionUpdates: [sampleEvent] },
      });
      await os.query.permissions.grantsTo('b.near');

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({
        id: 'b.near',
        ops: ['grant'],
        limit: 50,
      });
      expect(body.query).toMatch(/targetId: \{_eq: \$id\}/);
    });

    it('forPath filters by exact path', async () => {
      const { os, fetch } = makeOs({
        data: { permissionUpdates: [sampleEvent] },
      });
      await os.query.permissions.forPath('a.near/profile/', { limit: 25 });

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({
        path: 'a.near/profile/',
        limit: 25,
      });
      expect(body.query).toMatch(/path: \{_eq: \$path\}/);
    });

    it('history queries author OR target', async () => {
      const { os, fetch } = makeOs({
        data: { permissionUpdates: [sampleEvent] },
      });
      await os.query.permissions.history('a.near');

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.query).toMatch(/_or:/);
      expect(body.query).toMatch(/author: \{_eq: \$id\}/);
      expect(body.query).toMatch(/targetId: \{_eq: \$id\}/);
    });

    it('keyGrantsBy filters by author with key-grant ops only', async () => {
      const { os, fetch } = makeOs({
        data: {
          permissionUpdates: [{ ...sampleEvent, operation: 'grant_key' }],
        },
      });
      await os.query.permissions.keyGrantsBy('a.near', { limit: 5 });

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({
        id: 'a.near',
        ops: ['grant_key', 'key_grant'],
        limit: 5,
      });
    });

    it('returns [] when the indexer has no matching rows', async () => {
      const { os } = makeOs({ data: { permissionUpdates: [] } });
      expect(await os.query.permissions.grantsBy('nobody.near')).toEqual([]);
    });
  });

  describe('governance.*', () => {
    const sampleProposal = {
      operation: 'proposal_created',
      author: 'a.near',
      groupId: 'dao',
      blockHeight: 10,
      blockTimestamp: 100,
      proposalId: 'dao_1_1_a.near_1',
      proposalType: 'custom_proposal',
      status: 'active',
      sequenceNumber: 1,
      title: 'Test',
      description: '',
      autoVote: true,
      createdAt: 100,
      expiresAt: 200,
      lockedMemberCount: 4,
      lockedDeposit: '50000',
      voter: null,
      approve: null,
      yesVotes: null,
      noVotes: null,
      totalVotes: null,
      shouldExecute: null,
      shouldReject: null,
      votedAt: null,
      memberId: null,
      role: null,
      level: null,
      path: null,
      value: null,
      extraData: null,
    };

    it('proposals filters by group + proposal_created op', async () => {
      const { os, fetch } = makeOs({
        data: { groupUpdates: [sampleProposal] },
      });
      const rows = await os.query.governance.proposals('dao', { limit: 10 });
      expect(rows).toEqual([sampleProposal]);

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({
        groupId: 'dao',
        ops: ['proposal_created'],
        limit: 10,
        offset: 0,
      });
      expect(body.query).toMatch(/groupId: \{_eq: \$groupId\}/);
      expect(body.query).toMatch(/operation: \{_in: \$ops\}/);
      expect(body.query).not.toMatch(/proposalType:/);
    });

    it('proposals adds proposalType filter when provided', async () => {
      const { os, fetch } = makeOs({ data: { groupUpdates: [] } });
      await os.query.governance.proposals('dao', {
        proposalType: 'custom_proposal',
      });

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toMatchObject({
        proposalType: 'custom_proposal',
      });
      expect(body.query).toMatch(/proposalType: \{_eq: \$proposalType\}/);
    });

    it('proposal returns the full timeline ordered ASC', async () => {
      const { os, fetch } = makeOs({
        data: { groupUpdates: [sampleProposal] },
      });
      await os.query.governance.proposal('dao', 'dao_1_1_a.near_1');

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({
        groupId: 'dao',
        proposalId: 'dao_1_1_a.near_1',
        limit: 200,
      });
      expect(body.query).toMatch(/orderBy: \[\{blockHeight: ASC\}\]/);
      expect(body.query).toMatch(/proposalId: \{_eq: \$proposalId\}/);
    });

    it('proposalsBy filters by author and optional groupId', async () => {
      const { os, fetch } = makeOs({ data: { groupUpdates: [] } });
      await os.query.governance.proposalsBy('a.near', { groupId: 'dao' });

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({
        author: 'a.near',
        ops: ['proposal_created'],
        limit: 50,
        groupId: 'dao',
      });
      expect(body.query).toMatch(/groupId: \{_eq: \$groupId\}/);
    });

    it('proposalStatusUpdates filters by status when given', async () => {
      const { os, fetch } = makeOs({ data: { groupUpdates: [] } });
      await os.query.governance.proposalStatusUpdates('dao', {
        status: 'executed',
      });

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({
        groupId: 'dao',
        ops: ['proposal_status_updated'],
        limit: 50,
        status: 'executed',
      });
      expect(body.query).toMatch(/status: \{_eq: \$status\}/);
    });

    it('votes scopes to (groupId, proposalId) with vote_cast op', async () => {
      const { os, fetch } = makeOs({ data: { groupUpdates: [] } });
      await os.query.governance.votes('dao', 'dao_1_1_a.near_1');

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({
        groupId: 'dao',
        proposalId: 'dao_1_1_a.near_1',
        ops: ['vote_cast'],
        limit: 200,
      });
      expect(body.query).toMatch(/orderBy: \[\{blockHeight: ASC\}\]/);
    });

    it('votesBy filters by voter (not author)', async () => {
      const { os, fetch } = makeOs({ data: { groupUpdates: [] } });
      await os.query.governance.votesBy('a.near');

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({
        voter: 'a.near',
        ops: ['vote_cast'],
        limit: 50,
      });
      expect(body.query).toMatch(/voter: \{_eq: \$voter\}/);
    });

    it('members covers add/remove/invite/blacklist/unblacklist ops', async () => {
      const { os, fetch } = makeOs({ data: { groupUpdates: [] } });
      await os.query.governance.members('dao');

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables.ops).toEqual([
        'add_member',
        'remove_member',
        'member_invited',
        'add_to_blacklist',
        'remove_from_blacklist',
      ]);
    });

    it('memberHistory filters by memberId scoped to group', async () => {
      const { os, fetch } = makeOs({ data: { groupUpdates: [] } });
      await os.query.governance.memberHistory('dao', 'b.near');

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toMatchObject({
        groupId: 'dao',
        memberId: 'b.near',
      });
      expect(body.query).toMatch(/memberId: \{_eq: \$memberId\}/);
    });

    it('joinRequests narrows to a single status when provided', async () => {
      const { os, fetch } = makeOs({ data: { groupUpdates: [] } });
      await os.query.governance.joinRequests('dao', { status: 'submitted' });

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables.ops).toEqual(['join_request_submitted']);
    });

    it('joinRequests defaults to all 4 join ops', async () => {
      const { os, fetch } = makeOs({ data: { groupUpdates: [] } });
      await os.query.governance.joinRequests('dao');

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables.ops).toEqual([
        'join_request_submitted',
        'join_request_approved',
        'join_request_rejected',
        'join_request_cancelled',
      ]);
    });

    it('activity returns the full event stream for a group', async () => {
      const { os, fetch } = makeOs({ data: { groupUpdates: [] } });
      await os.query.governance.activity('dao', { limit: 25 });

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({ groupId: 'dao', limit: 25 });
      expect(body.query).not.toMatch(/operation: /);
    });

    it('returns [] when the indexer has no matching rows', async () => {
      const { os } = makeOs({ data: { groupUpdates: [] } });
      expect(await os.query.governance.proposals('dao')).toEqual([]);
    });
  });

  describe('scarces.*', () => {
    const sampleEvent = {
      eventType: 'SCARCE_UPDATE',
      operation: 'quick_mint',
      author: 'a.near',
      blockHeight: 10,
      blockTimestamp: 100,
      tokenId: 's:1',
      collectionId: null,
      listingId: null,
      ownerId: 'a.near',
      creatorId: null,
      buyerId: null,
      sellerId: null,
      bidder: null,
      accountId: null,
      appId: null,
      scarceContractId: null,
      amount: null,
      price: null,
      oldPrice: null,
      newPrice: null,
      bidAmount: null,
      marketplaceFee: null,
      appPoolAmount: null,
      creatorPayment: null,
      quantity: null,
      totalSupply: null,
      reservePrice: null,
      buyNowPrice: null,
      expiresAt: null,
      reason: null,
      memo: null,
      extraData: null,
    };

    it('events filters by eventType + operation array', async () => {
      const { os, fetch } = makeOs({
        data: { scarcesEvents: [sampleEvent] },
      });
      const rows = await os.query.scarces.events({
        eventType: 'SCARCE_UPDATE',
        operation: ['quick_mint', 'mint'],
        limit: 10,
      });
      expect(rows).toEqual([sampleEvent]);

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({
        eventType: 'SCARCE_UPDATE',
        operation: ['quick_mint', 'mint'],
        limit: 10,
        offset: 0,
      });
      expect(body.query).toMatch(/eventType: \{_eq: \$eventType\}/);
      expect(body.query).toMatch(/operation: \{_in: \$operation\}/);
    });

    it('tokenHistory filters by tokenId and orders ASC', async () => {
      const { os, fetch } = makeOs({ data: { scarcesEvents: [sampleEvent] } });
      await os.query.scarces.tokenHistory('s:1');

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({ tokenId: 's:1', limit: 200 });
      expect(body.query).toMatch(/tokenId: \{_eq: \$tokenId\}/);
      expect(body.query).toMatch(/orderBy: \[\{blockHeight: ASC\}\]/);
    });

    it('collection narrows by collectionId', async () => {
      const { os, fetch } = makeOs({ data: { scarcesEvents: [] } });
      await os.query.scarces.collection('genesis', { limit: 5 });

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toMatchObject({
        collectionId: 'genesis',
        limit: 5,
      });
      expect(body.query).toMatch(/collectionId: \{_eq: \$collectionId\}/);
    });

    it('recentMints applies SCARCE_UPDATE + mint ops filter', async () => {
      const { os, fetch } = makeOs({ data: { scarcesEvents: [] } });
      await os.query.scarces.recentMints({ limit: 25 });

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toMatchObject({
        eventType: 'SCARCE_UPDATE',
        operation: ['quick_mint', 'mint', 'mint_from_collection'],
        limit: 25,
      });
    });

    it('mintsBy adds the author filter', async () => {
      const { os, fetch } = makeOs({ data: { scarcesEvents: [] } });
      await os.query.scarces.mintsBy('a.near');

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toMatchObject({
        author: 'a.near',
        eventType: 'SCARCE_UPDATE',
        operation: ['quick_mint', 'mint', 'mint_from_collection'],
      });
    });

    it('sales narrows by buyerId/sellerId', async () => {
      const { os, fetch } = makeOs({ data: { scarcesEvents: [] } });
      await os.query.scarces.sales({ buyerId: 'b.near', limit: 10 });

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toMatchObject({
        buyerId: 'b.near',
        eventType: 'SCARCE_UPDATE',
        operation: ['purchase'],
      });
      expect(body.query).toMatch(/buyerId: \{_eq: \$buyerId\}/);
    });

    it('bids returns auction_bid events for a token in chronological order', async () => {
      const { os, fetch } = makeOs({ data: { scarcesEvents: [] } });
      await os.query.scarces.bids('s:1');

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({
        tokenId: 's:1',
        ops: ['auction_bid'],
        limit: 200,
      });
      expect(body.query).toMatch(/orderBy: \[\{blockHeight: ASC\}\]/);
    });

    it('lazyListingsBy filters by creatorId + LAZY_LISTING_UPDATE/created', async () => {
      const { os, fetch } = makeOs({ data: { scarcesEvents: [] } });
      await os.query.scarces.lazyListingsBy('a.near');

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({
        creatorId: 'a.near',
        eventType: 'LAZY_LISTING_UPDATE',
        ops: ['created'],
        limit: 50,
      });
    });

    it('offersOn filters by tokenId + OFFER_UPDATE/offer_made', async () => {
      const { os, fetch } = makeOs({ data: { scarcesEvents: [] } });
      await os.query.scarces.offersOn('s:1');

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toMatchObject({
        tokenId: 's:1',
        eventType: 'OFFER_UPDATE',
        operation: ['offer_made'],
      });
    });

    it('appActivity filters by appId + APP_POOL_UPDATE', async () => {
      const { os, fetch } = makeOs({ data: { scarcesEvents: [] } });
      await os.query.scarces.appActivity('my-app');

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toMatchObject({
        appId: 'my-app',
        eventType: 'APP_POOL_UPDATE',
      });
    });

    it('returns [] when the indexer has no matching rows', async () => {
      const { os } = makeOs({ data: { scarcesEvents: [] } });
      expect(await os.query.scarces.events()).toEqual([]);
    });
  });
});
