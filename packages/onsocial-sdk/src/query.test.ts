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
});
