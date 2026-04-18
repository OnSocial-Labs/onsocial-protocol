import { describe, it, expect, beforeEach, vi } from 'vitest';
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
  // ── Raw helpers (column-correctness) ────────────────────────────────────

  describe('profile()', () => {
    it('queries profilesCurrent with correct columns', async () => {
      const { os, fetch } = makeOs({
        data: {
          profilesCurrent: [
            {
              accountId: 'a.near',
              field: 'name',
              value: '"Alice"',
              blockHeight: 1,
              blockTimestamp: 2,
              operation: 'set',
            },
            {
              accountId: 'a.near',
              field: 'bio',
              value: '"Hello"',
              blockHeight: 1,
              blockTimestamp: 2,
              operation: 'set',
            },
          ],
        },
      });

      const res = await os.query.profile('a.near');
      expect(res.data?.profilesCurrent).toHaveLength(2);
      expect(res.data?.profilesCurrent[0].field).toBe('name');

      // Verify GraphQL query uses correct camelCase columns
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.query).toContain('field value blockHeight');
      expect(body.query).not.toContain('dataType');
      expect(body.query).not.toContain(' path ');
    });
  });

  describe('posts()', () => {
    it('uses accountId not author, with parameterised variables', async () => {
      const { os, fetch } = makeOs({
        data: {
          postsCurrent: [
            {
              accountId: 'a.near',
              postId: 'p1',
              value: '{}',
              blockHeight: 1,
              blockTimestamp: 2,
            },
          ],
        },
      });

      await os.query.posts({ author: 'a.near', limit: 5 });

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      // Must use $author variable, not interpolation
      expect(body.query).toContain('$author');
      expect(body.query).toContain('accountId');
      expect(body.query).not.toContain('"a.near"');
      expect(body.variables.author).toBe('a.near');
      expect(body.variables.limit).toBe(5);
    });

    it('selects postId, not author column', async () => {
      const { os, fetch } = makeOs({ data: { postsCurrent: [] } });
      await os.query.posts();
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.query).toContain('postId');
    });
  });

  describe('standingCounts()', () => {
    it('uses standingWithCount and standingWithOthersCount', async () => {
      const { os, fetch } = makeOs({
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

      await os.query.standingCounts('a.near');

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.query).toContain('standingWithCount');
      expect(body.query).toContain('standingWithOthersCount');
    });
  });

  describe('reactions()', () => {
    it('selects postOwner', async () => {
      const { os, fetch } = makeOs({ data: { reactionsCurrent: [] } });
      await os.query.reactions('owner.near', 'post/123');
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.query).toContain('postOwner');
      expect(body.query).not.toContain('targetAccount');
    });
  });

  describe('edgeCounts()', () => {
    it('uses inboundCount column', async () => {
      const { os, fetch } = makeOs({ data: { edgeCounts: [] } });
      await os.query.edgeCounts('a.near');
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.query).toContain('inboundCount');
    });
  });

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

      const profile = await os.query.getProfile('a.near');
      expect(profile).toEqual({
        name: '{"v":1,"displayName":"Alice"}',
        avatar: '{"v":1,"cid":"Qm..."}',
      });
    });

    it('returns null for unknown account', async () => {
      const { os } = makeOs({ data: { profilesCurrent: [] } });
      expect(await os.query.getProfile('ghost.near')).toBeNull();
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

      const page = await os.query.getPosts({ limit: 20 });
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

      const page = await os.query.getPosts({ limit: 20 });
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

      const page = await os.query.getFeed({
        standingWith: ['bob.near', 'carol.near'],
        limit: 10,
      });

      expect(page.items).toHaveLength(1);
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.query).toContain('_in: $accounts');
      expect(body.variables.accounts).toEqual(['bob.near', 'carol.near']);
    });

    it('returns empty for empty standing list', async () => {
      const { os, fetch } = makeOs({ data: { postsCurrent: [] } });
      const page = await os.query.getFeed({ standingWith: [] });
      expect(page.items).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
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

      const replies = await os.query.getReplies('alice.near', 'p1');
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

      const quotes = await os.query.getQuotes('alice.near', 'p1');
      expect(quotes).toHaveLength(1);
      expect(quotes[0].accountId).toBe('carol.near');
      expect(quotes[0].refAuthor).toBe('alice.near');

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.refPath).toBe('alice.near/post/p1');
    });
  });

  describe('getReactionCounts()', () => {
    it('returns total count', async () => {
      const { os } = makeOs({
        data: {
          reactionCounts: [{ reactionKind: 'like', reactionCount: 7 }],
        },
      });

      const counts = await os.query.getReactionCounts('alice.near', 'post/p1');
      expect(counts).toEqual({ like: 7, total: 7 });
    });

    it('returns only total when no reactions', async () => {
      const { os } = makeOs({ data: { reactionCounts: [] } });
      expect(await os.query.getReactionCounts('a.near', 'post/x')).toEqual({
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

      const result = await os.query.getStandingWith('a.near');
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

      const result = await os.query.getStanders('a.near');
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

      const counts = await os.query.getStandingCounts('a.near');
      expect(counts).toEqual({ standers: 42, standingWith: 7 });
    });

    it('returns zeros when no data', async () => {
      const { os } = makeOs({
        data: { standingCounts: [], standingOutCounts: [] },
      });
      expect(await os.query.getStandingCounts('ghost.near')).toEqual({
        standers: 0,
        standingWith: 0,
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

      const page = await os.query.getPostsByHashtag('#onchain', { limit: 10 });
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

      const page = await os.query.getPostsByHashtag('gm', { limit: 5 });
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

      const page = await os.query.getPostsByHashtag('gm', { limit: 20 });
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

      const tags = await os.query.getTrendingHashtags({ limit: 10 });
      expect(tags).toHaveLength(2);
      expect(tags[0].hashtag).toBe('onchain');
      expect(tags[0].postCount).toBe(42);

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.query).toContain('postCount: DESC');
    });

    it('returns empty array when no hashtags', async () => {
      const { os } = makeOs({ data: { hashtagCounts: [] } });
      expect(await os.query.getTrendingHashtags()).toEqual([]);
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

      const results = await os.query.searchHashtags('#on', { limit: 5 });
      expect(results).toHaveLength(2);

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.prefix).toBe('on%'); // stripped # + appended %
      expect(body.query).toContain('_like: $prefix');
    });
  });
});
