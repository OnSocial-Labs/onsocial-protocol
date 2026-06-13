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

function makeOsWithGraph(handler: (body: Record<string, unknown>) => unknown) {
  const fetch = vi
    .fn()
    .mockImplementation((_input: unknown, init?: RequestInit) => {
      const rawBody = typeof init?.body === 'string' ? init.body : '{}';
      const body = JSON.parse(rawBody) as Record<string, unknown>;
      const responseBody = handler(body);
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(responseBody),
        text: () => Promise.resolve(JSON.stringify(responseBody)),
      });
    });
  const os = new OnSocial({
    gatewayUrl: 'https://g.test',
    fetch,
    apiKey: 'test-key',
  });
  return { os, fetch };
}

function replyRow(
  replyAuthor: string,
  replyId: string,
  parentPath: string,
  blockHeight: number,
  groupId?: string
) {
  return {
    replyAuthor,
    replyId,
    value: JSON.stringify({ v: 1, text: replyId }),
    blockHeight,
    blockTimestamp: blockHeight * 10,
    groupId,
    parentAuthor: parentPath.split('/')[0],
    parentPath,
    parentType: 'post',
  };
}

function quoteRow(
  quoteAuthor: string,
  quoteId: string,
  refPath: string,
  blockHeight: number,
  groupId?: string
) {
  return {
    quoteAuthor,
    quoteId,
    value: JSON.stringify({ v: 1, text: quoteId }),
    blockHeight,
    blockTimestamp: blockHeight * 10,
    groupId,
    refAuthor: refPath.split('/')[0],
    refPath,
    refType: 'quote',
  };
}

function makeThreadGraph(opts: {
  repliesByParent?: Record<string, Array<Record<string, unknown>>>;
  quotesByRef?: Record<string, Array<Record<string, unknown>>>;
}) {
  return makeOsWithGraph((body) => {
    const variables = body.variables as Record<string, unknown>;
    const offset = Number(variables.offset ?? 0);
    const limit = Number(variables.limit ?? 100);
    const query = String(body.query ?? '');

    if (query.includes('threadReplies')) {
      const rows = opts.repliesByParent?.[String(variables.parentPath)] ?? [];
      return { data: { threadReplies: rows.slice(offset, offset + limit) } };
    }

    if (query.includes('quotes')) {
      const rows = opts.quotesByRef?.[String(variables.refPath)] ?? [];
      return { data: { quotes: rows.slice(offset, offset + limit) } };
    }

    return { data: {} };
  });
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

    it('looks up a profile search row by exact account id', async () => {
      const row = {
        accountId: 'alice.near',
        name: 'Alice',
        bio: 'Building on NEAR',
        avatar: 'ipfs://bafyAlice',
        banner: null,
        standingCount: 12,
        standingWithCount: 3,
        lastProfileBlock: 100,
        lastProfileTimestamp: 1000,
        lastActivityBlock: 120,
      };
      const { os, fetch } = makeOs({ data: { profileSearch: [row] } });

      await expect(os.query.profiles.lookup('alice.near')).resolves.toEqual(
        row
      );
      const body = JSON.parse(
        String((fetch.mock.calls[0]?.[1] as RequestInit | undefined)?.body)
      ) as { variables: Record<string, unknown>; query: string };
      expect(body.variables).toMatchObject({ id: 'alice.near' });
      expect(body.query).toContain('profileSearch');
      expect(body.query).toContain('accountId');
      expect(body.query).not.toContain('searchText');
    });

    it('returns null when profile search lookup misses', async () => {
      const { os } = makeOs({ data: { profileSearch: [] } });
      expect(await os.query.profiles.lookup('ghost.near')).toBeNull();
    });

    it('searches discoverable profile rows', async () => {
      const rows = [
        {
          accountId: 'alice.near',
          name: 'Alice',
          bio: 'Building on NEAR',
          avatar: 'ipfs://bafyAlice',
          banner: null,
          standingCount: 12,
          standingWithCount: 3,
          lastProfileBlock: 100,
          lastProfileTimestamp: 1000,
          lastActivityBlock: 120,
        },
      ];
      const { os, fetch } = makeOs({ data: { profileSearch: rows } });

      await expect(
        os.query.profiles.search({ query: 'alice', limit: 10 })
      ).resolves.toEqual(rows);
      const body = JSON.parse(
        String((fetch.mock.calls[0]?.[1] as RequestInit | undefined)?.body)
      ) as { variables: Record<string, unknown>; query: string };
      expect(body.variables).toMatchObject({
        pattern: '%alice%',
        limit: 10,
        offset: 0,
      });
      expect(body.query).toContain('profileSearch');
      expect(body.query).toContain('searchText');
    });

    it('discoverPage without viewer uses search (one round-trip)', async () => {
      const rows = [
        {
          accountId: 'alice.near',
          name: 'Alice',
          bio: null,
          avatar: null,
          banner: null,
          standingCount: 1,
          standingWithCount: 0,
          mutualStandingCount: 0,
          endorsementsReceivedCount: 0,
          endorsementsGivenCount: 0,
          firstProfileTimestamp: null,
          lastProfileBlock: 1,
          lastProfileTimestamp: 1,
          lastActivityBlock: 1,
        },
      ];
      const { os, fetch } = makeOs({ data: { profileSearch: rows } });

      const page = await os.query.profiles.discoverPage({ limit: 10 });
      expect(page.profiles).toEqual(rows);
      expect(page.viewer).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('discoverPage with viewer uses search plus one batched context query', async () => {
      const { os, fetch } = makeOsWithGraph((body) => {
        const query = String(body.query ?? '');
        if (query.includes('ProfileDiscoverViewerContext')) {
          return {
            data: {
              viewerOutgoing: [
                {
                  accountId: 'bob.near',
                  targetAccount: 'carol.near',
                  value: '{"since":42}',
                  blockHeight: 1,
                  blockTimestamp: 9,
                },
              ],
              viewerIncoming: [{ accountId: 'carol.near' }],
              viewerEndorsements: [{ issuer: 'carol.near' }],
            },
          };
        }
        return {
          data: {
            profileSearch: [
              {
                accountId: 'carol.near',
                name: 'Carol',
                bio: null,
                avatar: null,
                banner: null,
                standingCount: 1,
                standingWithCount: 1,
                mutualStandingCount: 0,
                endorsementsReceivedCount: 0,
                endorsementsGivenCount: 0,
                firstProfileTimestamp: 1,
                lastProfileBlock: 1,
                lastProfileTimestamp: 1,
                lastActivityBlock: 1,
              },
            ],
          },
        };
      });

      const page = await os.query.profiles.discoverPage({
        viewerAccountId: 'bob.near',
        limit: 5,
      });

      expect(page.profiles).toHaveLength(1);
      expect(page.viewer?.outgoing[0]).toMatchObject({
        targetAccount: 'carol.near',
        since: 42,
        blockTimestamp: 9,
      });
      expect(page.viewer?.incomingAccountIds).toContain('carol.near');
      expect(page.viewer?.endorsementIssuers).toEqual(['carol.near']);
      expect(fetch).toHaveBeenCalledTimes(2);
      const contextBody = JSON.parse(
        String((fetch.mock.calls[1]?.[1] as RequestInit | undefined)?.body)
      ) as { query: string };
      expect(contextBody.query).toContain('ProfileDiscoverViewerContext');
      expect(contextBody.query).toContain(
        'viewerEndorsements: endorsementsCurrent'
      );
    });

    it('discoverPage with viewer skips context query when search is empty', async () => {
      const { os, fetch } = makeOs({ data: { profileSearch: [] } });

      const page = await os.query.profiles.discoverPage({
        viewerAccountId: 'bob.near',
        limit: 5,
      });

      expect(page.profiles).toEqual([]);
      expect(page.viewer).toEqual({
        outgoing: [],
        incomingAccountIds: [],
        endorsementIssuers: [],
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('socialPreview batches graph into two round-trips', async () => {
      const { os, fetch } = makeOsWithGraph((body) => {
        const query = String(body.query ?? '');
        if (query.includes('StandingPeerEnrichment')) {
          return {
            data: {
              profileSearch: [
                {
                  accountId: 'bob.near',
                  name: 'Bob',
                  bio: null,
                  avatar: 'ipfs://b',
                  banner: null,
                  standingCount: 2,
                  standingWithCount: 1,
                  mutualStandingCount: 0,
                  endorsementsReceivedCount: 0,
                  endorsementsGivenCount: 0,
                  firstProfileTimestamp: 1,
                  lastProfileBlock: 1,
                  lastProfileTimestamp: 1,
                  lastActivityBlock: 1,
                },
              ],
              viewerOutgoing: [{ targetAccount: 'bob.near' }],
              viewerIncoming: [],
            },
          };
        }
        if (query.includes('ProfileSocialPreviewWithViewer')) {
          return {
            data: {
              standingCounts: [{ standingWithCount: 3 }],
              standingOutCounts: [{ standingWithOthersCount: 2 }],
              profileSearch: [{ mutualStandingCount: 1 }],
              incomingPreview: [
                {
                  accountId: 'bob.near',
                  targetAccount: 'alice.near',
                  value: '{"since":1}',
                  blockHeight: 1,
                  blockTimestamp: 9,
                },
              ],
              outgoingPreview: [],
              mutualPreview: [],
              viewerToSubject: [{ accountId: 'carol.near' }],
              subjectToViewer: [],
            },
          };
        }
        return { data: {} };
      });

      const preview = await os.query.profiles.socialPreview({
        accountId: 'alice.near',
        viewerAccountId: 'carol.near',
        previewLimit: 8,
      });

      expect(preview.counts).toEqual({ incoming: 3, outgoing: 2, mutual: 1 });
      expect(preview.incoming[0]?.accountId).toBe('bob.near');
      expect(preview.viewerStanding).toBe(true);
      expect(preview.peers[0]?.name).toBe('Bob');
      expect(preview.viewerOutgoingPeerIds).toEqual(['bob.near']);
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('stats', () => {
    it('protocolTotals reads profile and group aggregates', async () => {
      const { os, fetch } = makeOs({
        data: {
          profilesTotal: { aggregate: { count: 42 } },
          discoverableProfilesTotal: { aggregate: { count: 15 } },
          groupsTotal: { aggregate: { count: 7 } },
        },
      });

      await expect(os.query.stats.protocolTotals()).resolves.toEqual({
        profiles: 42,
        discoverableProfiles: 15,
        groups: 7,
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(
        String((fetch.mock.calls[0]?.[1] as RequestInit | undefined)?.body)
      ) as { query: string };
      expect(body.query).toContain('profilesCurrentAggregate');
      expect(body.query).toContain('profileSearchAggregate');
      expect(body.query).toContain('groupUpdatesAggregate');
    });

    it('protocolPulse fetches curated gateway snapshot', async () => {
      const pulse = {
        generatedAt: '2026-01-01T00:00:00.000Z',
        windowHours: 24,
        totals: { profiles: 10, discoverableProfiles: 8, groups: 2 },
        recent24h: { posts: 3, reactions: 12 },
      };
      const fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(pulse),
        text: () => Promise.resolve(JSON.stringify(pulse)),
      });
      const os = new OnSocial({
        gatewayUrl: 'https://g.test',
        fetch,
        apiKey: 'test-key',
      });

      await expect(os.query.stats.protocolPulse()).resolves.toEqual(pulse);
      expect(fetch).toHaveBeenCalledWith(
        'https://g.test/graph/protocol-pulse',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ 'X-API-Key': 'test-key' }),
        })
      );
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

  describe('getThreadTree()', () => {
    it('walks nested replies, quote replies, and quote-of-quote branches', async () => {
      const rootPath = 'alice.near/post/root';
      const r1Path = 'bob.near/post/r1';
      const q1Path = 'carol.near/post/q1';
      const { os } = makeThreadGraph({
        repliesByParent: {
          [rootPath]: [replyRow('bob.near', 'r1', rootPath, 11)],
          [r1Path]: [replyRow('dan.near', 'r2', r1Path, 12)],
          [q1Path]: [replyRow('erin.near', 'qr1', q1Path, 14)],
        },
        quotesByRef: {
          [rootPath]: [quoteRow('carol.near', 'q1', rootPath, 13)],
          [q1Path]: [quoteRow('fay.near', 'q2', q1Path, 15)],
        },
      });

      const tree = await os.query.threads.tree('alice.near', 'root', {
        depth: 3,
        pageSize: 10,
      });

      expect(tree.rootPath).toBe(rootPath);
      expect(tree.truncated).toBe(false);
      expect(tree.replies[0].post.postId).toBe('r1');
      expect(tree.replies[0].replies[0].post.postId).toBe('r2');
      expect(tree.quotes[0].post.postId).toBe('q1');
      expect(tree.quotes[0].post.refPath).toBe(rootPath);
      expect(tree.quotes[0].replies[0].post.postId).toBe('qr1');
      expect(tree.quotes[0].replies[0].post.parentPath).toBe(q1Path);
      expect(tree.quotes[0].quotes[0].post.postId).toBe('q2');
      expect(tree.quotes[0].quotes[0].post.refPath).toBe(q1Path);
      expect(tree.flat.map((node) => node.post.postId)).toEqual([
        'r1',
        'r2',
        'q1',
        'qr1',
        'q2',
      ]);
    });

    it('honors depth=1 for immediate children only', async () => {
      const rootPath = 'alice.near/post/root';
      const r1Path = 'bob.near/post/r1';
      const q1Path = 'carol.near/post/q1';
      const { os, fetch } = makeThreadGraph({
        repliesByParent: {
          [rootPath]: [replyRow('bob.near', 'r1', rootPath, 11)],
          [r1Path]: [replyRow('dan.near', 'r2', r1Path, 12)],
          [q1Path]: [replyRow('erin.near', 'qr1', q1Path, 14)],
        },
        quotesByRef: {
          [rootPath]: [quoteRow('carol.near', 'q1', rootPath, 13)],
        },
      });

      const tree = await os.query.threads.tree('alice.near', 'root', {
        depth: 1,
      });

      expect(tree.replies[0].replies).toEqual([]);
      expect(tree.quotes[0].replies).toEqual([]);
      expect(tree.flat.map((node) => node.post.postId)).toEqual(['r1', 'q1']);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('paginates long sibling lists while building shallow trees', async () => {
      const rootPath = 'alice.near/post/root';
      const { os, fetch } = makeThreadGraph({
        repliesByParent: {
          [rootPath]: [
            replyRow('bob.near', 'r1', rootPath, 11),
            replyRow('bob.near', 'r2', rootPath, 12),
            replyRow('bob.near', 'r3', rootPath, 13),
          ],
        },
      });

      const tree = await os.query.threads.tree('alice.near', 'root', {
        depth: 1,
        includeQuotes: false,
        pageSize: 2,
        replyLimit: 10,
      });

      expect(tree.replies.map((node) => node.post.postId)).toEqual([
        'r1',
        'r2',
        'r3',
      ]);
      const offsets = fetch.mock.calls.map((call) => {
        const body = JSON.parse(
          String((call as unknown as [unknown, RequestInit])[1].body)
        );
        return body.variables.offset;
      });
      expect(offsets).toEqual([0, 2]);
    });

    it('stops expansion at maxNodes and reports truncation', async () => {
      const rootPath = 'alice.near/post/root';
      const { os } = makeThreadGraph({
        repliesByParent: {
          [rootPath]: [
            replyRow('bob.near', 'r1', rootPath, 11),
            replyRow('bob.near', 'r2', rootPath, 12),
          ],
        },
      });

      const tree = await os.query.threads.tree('alice.near', 'root', {
        depth: 1,
        includeQuotes: false,
        maxNodes: 1,
      });

      expect(tree.truncated).toBe(true);
      expect(tree.flat.map((node) => node.post.postId)).toEqual(['r1']);
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

  describe('getGroupThreadTree()', () => {
    it('uses the full group content path for typed refs', async () => {
      const parentPath = 'alice.near/groups/dao/content/post/root';
      const { os, fetch } = makeThreadGraph({
        repliesByParent: {
          [parentPath]: [replyRow('bob.near', 'r1', parentPath, 11, 'dao')],
        },
      });

      const tree = await os.query.groups.threadTree(
        { author: 'alice.near', groupId: 'dao', postId: 'root' },
        { depth: 1, includeQuotes: false }
      );

      expect(tree.rootPath).toBe(parentPath);
      expect(tree.replies[0].path).toBe('bob.near/groups/dao/content/post/r1');
      const body = JSON.parse(
        String(
          (fetch.mock.calls[0] as unknown as [unknown, RequestInit])[1].body
        )
      );
      expect(body.variables.parentPath).toBe(parentPath);
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

  describe('viewerStandsWith()', () => {
    it('returns true when an edge exists', async () => {
      const { os } = makeOs({
        data: { standingsCurrent: [{ accountId: 'bob.near' }] },
      });
      await expect(
        os.query.standings.viewerStandsWith('bob.near', 'alice.near')
      ).resolves.toBe(true);
    });

    it('returns false when no edge exists', async () => {
      const { os } = makeOs({ data: { standingsCurrent: [] } });
      await expect(
        os.query.standings.viewerStandsWith('bob.near', 'alice.near')
      ).resolves.toBe(false);
    });
  });

  describe('mutualCount()', () => {
    it('reads mutualStandingCount from profile_search', async () => {
      const { os } = makeOs({
        data: { profileSearch: [{ mutualStandingCount: 12 }] },
      });
      await expect(os.query.standings.mutualCount('alice.near')).resolves.toBe(
        12
      );
    });
  });

  describe('listPage()', () => {
    it('batches incoming rows and tab counts in one round-trip', async () => {
      const { os, fetch } = makeOs({
        data: {
          standingCounts: [{ standingWithCount: 5 }],
          standingOutCounts: [{ standingWithOthersCount: 3 }],
          profileSearch: [{ mutualStandingCount: 2 }],
          standingsCurrent: [
            {
              accountId: 'bob.near',
              targetAccount: 'alice.near',
              value: '{"since":1}',
              blockHeight: 1,
              blockTimestamp: 2,
            },
          ],
        },
      });

      const page = await os.query.standings.listPage({
        accountId: 'alice.near',
        direction: 'incoming',
        limit: 24,
        offset: 0,
        includeCounts: true,
      });

      expect(page.total).toBe(5);
      expect(page.counts).toEqual({ incoming: 5, outgoing: 3, mutual: 2 });
      expect(page.rows[0]?.accountId).toBe('bob.near');
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('enrichPeers()', () => {
    it('loads profile search rows and viewer context together', async () => {
      const { os, fetch } = makeOs({
        data: {
          profileSearch: [
            {
              accountId: 'bob.near',
              name: 'Bob',
              bio: null,
              avatar: null,
              banner: null,
              standingCount: 1,
              standingWithCount: 1,
              mutualStandingCount: 0,
              endorsementsReceivedCount: 0,
              endorsementsGivenCount: 0,
              firstProfileTimestamp: 1,
              lastProfileBlock: 1,
              lastProfileTimestamp: 1,
              lastActivityBlock: 1,
            },
          ],
          viewerOutgoing: [{ targetAccount: 'bob.near' }],
          viewerIncoming: [],
        },
      });

      const enrichment = await os.query.standings.enrichPeers('carol.near', [
        'bob.near',
      ]);

      expect(enrichment.profiles[0]?.name).toBe('Bob');
      expect(enrichment.viewerOutgoingPeerIds).toEqual(['bob.near']);
      expect(fetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.query).toContain('StandingPeerEnrichment');
    });
  });

  describe('networkSample()', () => {
    it('batches lists and enrichment into two round-trips', async () => {
      const { os, fetch } = makeOsWithGraph((body) => {
        const query = String(body.query ?? '');
        if (query.includes('StandingPeerEnrichment')) {
          return {
            data: {
              profileSearch: [
                {
                  accountId: 'bob.near',
                  name: 'Bob',
                  bio: null,
                  avatar: null,
                  banner: null,
                  standingCount: 1,
                  standingWithCount: 1,
                  mutualStandingCount: 0,
                  endorsementsReceivedCount: 0,
                  endorsementsGivenCount: 0,
                  firstProfileTimestamp: 1,
                  lastProfileBlock: 1,
                  lastProfileTimestamp: 1,
                  lastActivityBlock: 1,
                },
              ],
              viewerOutgoing: [],
              viewerIncoming: [],
            },
          };
        }
        if (query.includes('StandingNetworkSample')) {
          return {
            data: {
              standingCounts: [{ standingWithCount: 4 }],
              standingOutCounts: [{ standingWithOthersCount: 3 }],
              profileSearch: [{ mutualStandingCount: 1 }],
              incomingSample: [
                {
                  accountId: 'bob.near',
                  targetAccount: 'alice.near',
                  value: '{"since":1}',
                  blockHeight: 1,
                  blockTimestamp: 9,
                },
              ],
              outgoingSample: [],
              mutualSample: [],
            },
          };
        }
        return { data: {} };
      });

      const sample = await os.query.standings.networkSample({
        accountId: 'alice.near',
        viewerAccountId: 'carol.near',
        mutualLimit: 12,
        incomingLimit: 24,
        outgoingLimit: 24,
      });

      expect(sample.counts).toEqual({ incoming: 4, outgoing: 3, mutual: 1 });
      expect(sample.incoming[0]?.accountId).toBe('bob.near');
      expect(sample.peers[0]?.name).toBe('Bob');
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('paginated standing lists', () => {
    it('incomingDetailed passes limit and offset', async () => {
      const { os, fetch } = makeOs({
        data: {
          standingsCurrent: [
            {
              accountId: 'bob.near',
              targetAccount: 'alice.near',
              value: '{"since":1}',
              blockHeight: 1,
              blockTimestamp: 2,
            },
          ],
        },
      });
      await os.query.standings.incomingDetailed('alice.near', {
        limit: 24,
        offset: 48,
      });
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables).toMatchObject({
        id: 'alice.near',
        limit: 24,
        offset: 48,
      });
      expect(body.query).toContain('offset: $offset');
    });

    it('incomingFilteredPage uses standingsCurrentAggregate for total', async () => {
      const { os, fetch } = makeOs({
        data: {
          standingsCurrent: [],
          standingsCurrentAggregate: { aggregate: { count: 3 } },
        },
      });
      const page = await os.query.standings.incomingFilteredPage(
        'alice.near',
        ['bob.near'],
        { limit: 10, offset: 0 }
      );
      expect(page.total).toBe(3);
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('endorsements query', () => {
    it('counts reads profile_search endorsement fields', async () => {
      const { os } = makeOs({
        data: {
          profileSearch: [
            { endorsementsReceivedCount: 4, endorsementsGivenCount: 7 },
          ],
        },
      });
      await expect(os.query.endorsements.counts('alice.near')).resolves.toEqual(
        { received: 4, given: 7 }
      );
    });

    it('receivedFromIssuer filters issuer and target', async () => {
      const { os, fetch } = makeOs({
        data: {
          endorsementsCurrent: [
            {
              issuer: 'bob.near',
              target: 'alice.near',
              value: '{"v":1,"since":1,"topic":"rust"}',
              blockHeight: 1,
              blockTimestamp: 2,
              operation: 'set',
            },
          ],
        },
      });
      const rows = await os.query.endorsements.receivedFromIssuer(
        'bob.near',
        'alice.near'
      );
      expect(rows).toHaveLength(1);
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables).toMatchObject({
        issuer: 'bob.near',
        target: 'alice.near',
      });
    });

    it('preview batches counts and both lists in one round-trip', async () => {
      const { os, fetch } = makeOs({
        data: {
          profileSearch: [
            { endorsementsReceivedCount: 2, endorsementsGivenCount: 3 },
          ],
          received: [
            {
              issuer: 'bob.near',
              target: 'alice.near',
              value: '{"v":1,"since":1}',
              blockHeight: 1,
              blockTimestamp: 2,
              operation: 'set',
            },
          ],
          given: [],
        },
      });

      const preview = await os.query.endorsements.preview({
        accountId: 'alice.near',
        limit: 24,
      });

      expect(preview.counts).toEqual({ received: 2, given: 3 });
      expect(preview.received).toHaveLength(1);
      expect(fetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.query).toContain('EndorsementPreview');
    });

    it('previewBundle adds one profile search batch', async () => {
      const { os, fetch } = makeOsWithGraph((body) => {
        const query = String(body.query ?? '');
        if (query.includes('EndorsementPreview')) {
          return {
            data: {
              profileSearch: [
                { endorsementsReceivedCount: 1, endorsementsGivenCount: 0 },
              ],
              received: [
                {
                  issuer: 'bob.near',
                  target: 'alice.near',
                  value: '{"v":1,"since":1}',
                  blockHeight: 1,
                  blockTimestamp: 2,
                  operation: 'set',
                },
              ],
              given: [],
            },
          };
        }
        if (query.includes('ProfileStatsBatch')) {
          return {
            data: {
              profileSearch: [
                {
                  accountId: 'bob.near',
                  name: 'Bob',
                  bio: null,
                  avatar: null,
                  banner: null,
                  standingCount: 0,
                  standingWithCount: 0,
                  mutualStandingCount: 0,
                  endorsementsReceivedCount: 0,
                  endorsementsGivenCount: 0,
                  firstProfileTimestamp: 1,
                  lastProfileBlock: 1,
                  lastProfileTimestamp: 1,
                  lastActivityBlock: 1,
                },
              ],
            },
          };
        }
        return { data: {} };
      });

      const bundle = await os.query.endorsements.previewBundle({
        accountId: 'alice.near',
        limit: 24,
      });

      expect(bundle.profiles[0]?.name).toBe('Bob');
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('graph edges', () => {
    it('queries outgoing graph edges with typed filters', async () => {
      const { os, fetch } = makeOs({
        data: {
          edgesCurrent: [
            {
              edgeId: 'alice.near/reaction/bob.near/like/post/p1',
              sourceAccount: 'alice.near',
              targetAccount: 'bob.near',
              targetType: 'content',
              targetPath: 'post/p1',
              edgeType: 'reaction',
              edgeKind: 'like',
              source: 'alice.near',
              target: 'bob.near',
              value: '{"v":1,"type":"like"}',
              blockHeight: 10,
              blockTimestamp: 100,
              operation: 'set',
              groupId: null,
            },
          ],
        },
      });

      const rows = await os.query.graph.outgoing('alice.near', {
        edgeType: 'reaction',
        edgeKind: 'like',
      });

      expect(rows[0].targetPath).toBe('post/p1');
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.query).toContain('edgesCurrent');
      expect(body.query).toContain('sourceAccount: {_eq: $sourceAccount}');
      expect(body.query).toContain('edgeKind: {_eq: $edgeKind}');
      expect(body.variables).toMatchObject({
        sourceAccount: 'alice.near',
        edgeType: 'reaction',
        edgeKind: 'like',
        limit: 100,
        offset: 0,
      });
    });

    it('queries content graph edges', async () => {
      const { os, fetch } = makeOs({ data: { edgesCurrent: [] } });

      await os.query.graph.forContent('bob.near', 'post/p1', {
        edgeType: 'reaction',
      });

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables).toMatchObject({
        targetAccount: 'bob.near',
        targetPath: 'post/p1',
        targetType: 'content',
        edgeType: 'reaction',
      });
    });

    it('queries graph edge counts with kind-aware grouping', async () => {
      const { os, fetch } = makeOs({
        data: {
          edgeCounts: [
            {
              accountId: 'bob.near',
              targetType: 'content',
              edgeType: 'reaction',
              edgeKind: 'like',
              inboundCount: 3,
              lastBlock: 42,
            },
          ],
        },
      });

      const rows = await os.query.graph.counts('bob.near', {
        edgeType: 'reaction',
        edgeKind: 'like',
      });

      expect(rows[0]).toMatchObject({
        edgeType: 'reaction',
        edgeKind: 'like',
        inboundCount: 3,
      });
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.query).toContain('edgeCounts');
      expect(body.query).toContain('edgeKind: {_eq: $edgeKind}');
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
      operation: 'storage_tip',
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
      expect(body.query).toMatch(/operation: \{_eq: "storage_tip"\}/);
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
        operation: ['quick_mint'],
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
        operation: ['quick_mint'],
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

  describe('rewards.*', () => {
    const sampleEvent = {
      id: 'r:1',
      eventType: 'REWARD_CREDITED',
      accountId: 'alice.near',
      success: true,
      blockHeight: 10,
      blockTimestamp: 100,
      receiptId: 'rcpt:1',
      amount: '1000',
      source: 'engagement',
      creditedBy: 'gov.near',
      appId: 'chat',
      newBalance: null,
      oldOwner: null,
      newOwner: null,
      oldMax: null,
      newMax: null,
      caller: null,
      oldVersion: null,
      newVersion: null,
      extraData: null,
    };
    const sampleState = {
      accountId: 'alice.near',
      totalEarned: '5000',
      totalClaimed: '1000',
      lastCreditBlock: 100,
      lastClaimBlock: 90,
      updatedAt: 1714000000000,
    };

    it('events filters by eventType array + accountId', async () => {
      const { os, fetch } = makeOs({
        data: { rewardsEvents: [sampleEvent] },
      });
      const rows = await os.query.rewards.events({
        eventType: ['REWARD_CREDITED', 'REWARD_CLAIMED'],
        accountId: 'alice.near',
        limit: 10,
      });
      expect(rows).toEqual([sampleEvent]);

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({
        eventType: ['REWARD_CREDITED', 'REWARD_CLAIMED'],
        accountId: 'alice.near',
        limit: 10,
        offset: 0,
      });
      expect(body.query).toMatch(/eventType: \{_in: \$eventType\}/);
      expect(body.query).toMatch(/accountId: \{_eq: \$accountId\}/);
    });

    it('userState returns first row or null', async () => {
      const { os, fetch } = makeOs({
        data: { userRewardState: [sampleState] },
      });
      const state = await os.query.rewards.userState('alice.near');
      expect(state).toEqual(sampleState);

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({ accountId: 'alice.near' });
      expect(body.query).toMatch(/accountId: \{_eq: \$accountId\}/);
    });

    it('userState returns null when no rows', async () => {
      const { os } = makeOs({ data: { userRewardState: [] } });
      expect(await os.query.rewards.userState('bob.near')).toBeNull();
    });

    it('topEarners orders by totalEarned DESC', async () => {
      const { os, fetch } = makeOs({
        data: { userRewardState: [sampleState] },
      });
      await os.query.rewards.topEarners({ limit: 5 });

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({ limit: 5, offset: 0 });
      expect(body.query).toMatch(/orderBy: \[\{totalEarned: DESC\}\]/);
    });

    it('recentCredits applies REWARD_CREDITED filter', async () => {
      const { os, fetch } = makeOs({ data: { rewardsEvents: [] } });
      await os.query.rewards.recentCredits({ limit: 25 });

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toMatchObject({
        eventType: 'REWARD_CREDITED',
        limit: 25,
      });
    });

    it('recentClaims applies REWARD_CLAIMED filter', async () => {
      const { os, fetch } = makeOs({ data: { rewardsEvents: [] } });
      await os.query.rewards.recentClaims();

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toMatchObject({
        eventType: 'REWARD_CLAIMED',
      });
    });

    it('creditsTo narrows by accountId + REWARD_CREDITED', async () => {
      const { os, fetch } = makeOs({ data: { rewardsEvents: [] } });
      await os.query.rewards.creditsTo('alice.near', { appId: 'chat' });

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toMatchObject({
        accountId: 'alice.near',
        appId: 'chat',
        eventType: 'REWARD_CREDITED',
      });
      expect(body.query).toMatch(/appId: \{_eq: \$appId\}/);
    });

    it('creditsBy filters by creditedBy column', async () => {
      const { os, fetch } = makeOs({ data: { rewardsEvents: [] } });
      await os.query.rewards.creditsBy('gov.near');

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toMatchObject({
        creditedBy: 'gov.near',
        eventType: 'REWARD_CREDITED',
      });
      expect(body.query).toMatch(/creditedBy: \{_eq: \$creditedBy\}/);
    });

    it('claimsBy narrows by accountId + REWARD_CLAIMED', async () => {
      const { os, fetch } = makeOs({ data: { rewardsEvents: [] } });
      await os.query.rewards.claimsBy('alice.near');

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toMatchObject({
        accountId: 'alice.near',
        eventType: 'REWARD_CLAIMED',
      });
    });

    it('appActivity narrows by appId + REWARD_CREDITED', async () => {
      const { os, fetch } = makeOs({ data: { rewardsEvents: [] } });
      await os.query.rewards.appActivity('chat', { limit: 20 });

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toMatchObject({
        appId: 'chat',
        eventType: 'REWARD_CREDITED',
        limit: 20,
      });
    });

    it('poolDeposits filters by POOL_DEPOSIT', async () => {
      const { os, fetch } = makeOs({ data: { rewardsEvents: [] } });
      await os.query.rewards.poolDeposits();

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toMatchObject({ eventType: 'POOL_DEPOSIT' });
    });

    it('returns [] when the indexer has no matching rows', async () => {
      const { os } = makeOs({ data: { rewardsEvents: [] } });
      expect(await os.query.rewards.events()).toEqual([]);
    });
  });

  describe('token.*', () => {
    const sampleTransfer = {
      id: 't:1',
      eventType: 'ft_transfer',
      blockHeight: 10,
      blockTimestamp: 100,
      receiptId: 'rcpt:1',
      ownerId: null,
      amount: '1000',
      memo: null,
      oldOwnerId: 'alice.near',
      newOwnerId: 'bob.near',
      extraData: null,
    };
    const sampleActivity = {
      accountId: 'alice.near',
      lastEventType: 'ft_transfer',
      lastEventBlock: 10,
      updatedAt: 1714000000000,
    };

    it('events filters by eventType array + accountId (mapped to ownerId)', async () => {
      const { os, fetch } = makeOs({
        data: { tokenEvents: [sampleTransfer] },
      });
      const rows = await os.query.token.events({
        eventType: ['ft_mint', 'ft_burn'],
        accountId: 'alice.near',
        limit: 10,
      });
      expect(rows).toEqual([sampleTransfer]);

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({
        eventType: ['ft_mint', 'ft_burn'],
        accountId: 'alice.near',
        limit: 10,
        offset: 0,
      });
      expect(body.query).toMatch(/eventType: \{_in: \$eventType\}/);
      expect(body.query).toMatch(/ownerId: \{_eq: \$accountId\}/);
    });

    it('activity OR-matches owner_id, old_owner_id, new_owner_id', async () => {
      const { os, fetch } = makeOs({
        data: { tokenEvents: [sampleTransfer] },
      });
      await os.query.token.activity('alice.near', { limit: 25 });

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({
        accountId: 'alice.near',
        limit: 25,
        offset: 0,
      });
      expect(body.query).toMatch(/ownerId: \{_eq: \$accountId\}/);
      expect(body.query).toMatch(/oldOwnerId: \{_eq: \$accountId\}/);
      expect(body.query).toMatch(/newOwnerId: \{_eq: \$accountId\}/);
    });

    it('lastSeen returns first row or null', async () => {
      const { os, fetch } = makeOs({
        data: { tokenBalances: [sampleActivity] },
      });
      const row = await os.query.token.lastSeen('alice.near');
      expect(row).toEqual(sampleActivity);

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({ accountId: 'alice.near' });
    });

    it('lastSeen returns null when no rows', async () => {
      const { os } = makeOs({ data: { tokenBalances: [] } });
      expect(await os.query.token.lastSeen('bob.near')).toBeNull();
    });

    it('mostActiveAccounts orders by lastEventBlock DESC', async () => {
      const { os, fetch } = makeOs({
        data: { tokenBalances: [sampleActivity] },
      });
      await os.query.token.mostActiveAccounts({ limit: 5 });

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({ limit: 5, offset: 0 });
      expect(body.query).toMatch(/orderBy: \[\{lastEventBlock: DESC\}\]/);
    });

    it('recentTransfers applies ft_transfer filter', async () => {
      const { os, fetch } = makeOs({ data: { tokenEvents: [] } });
      await os.query.token.recentTransfers({ limit: 25 });

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toMatchObject({
        eventType: 'ft_transfer',
        limit: 25,
      });
    });

    it('recentMints applies ft_mint filter', async () => {
      const { os, fetch } = makeOs({ data: { tokenEvents: [] } });
      await os.query.token.recentMints();

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toMatchObject({ eventType: 'ft_mint' });
    });

    it('recentBurns applies ft_burn filter', async () => {
      const { os, fetch } = makeOs({ data: { tokenEvents: [] } });
      await os.query.token.recentBurns();

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toMatchObject({ eventType: 'ft_burn' });
    });

    it('transfersFrom narrows by oldOwnerId + ft_transfer', async () => {
      const { os, fetch } = makeOs({ data: { tokenEvents: [] } });
      await os.query.token.transfersFrom('alice.near', { limit: 20 });

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toMatchObject({
        oldOwnerId: 'alice.near',
        eventType: 'ft_transfer',
        limit: 20,
      });
      expect(body.query).toMatch(/oldOwnerId: \{_eq: \$oldOwnerId\}/);
    });

    it('transfersTo narrows by newOwnerId + ft_transfer', async () => {
      const { os, fetch } = makeOs({ data: { tokenEvents: [] } });
      await os.query.token.transfersTo('bob.near');

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toMatchObject({
        newOwnerId: 'bob.near',
        eventType: 'ft_transfer',
      });
      expect(body.query).toMatch(/newOwnerId: \{_eq: \$newOwnerId\}/);
    });

    it('returns [] when the indexer has no matching rows', async () => {
      const { os } = makeOs({ data: { tokenEvents: [] } });
      expect(await os.query.token.events()).toEqual([]);
    });
  });

  describe('boost.*', () => {
    const sampleEvent = {
      id: 'b:1',
      eventType: 'BOOST_LOCK',
      accountId: 'alice.near',
      success: true,
      blockHeight: 10,
      blockTimestamp: 100,
      receiptId: 'rcpt:1',
      amount: '10000000000000000',
      effectiveBoost: '12000000000000000',
      months: 12,
      newMonths: null,
      newEffectiveBoost: null,
      elapsedNs: null,
      totalReleased: null,
      remainingPool: null,
      infraShare: null,
      rewardsShare: null,
      totalPool: null,
      receiverId: null,
      oldOwner: null,
      newOwner: null,
      oldVersion: null,
      newVersion: null,
      deposit: null,
      extraData: null,
    };
    const sampleState = {
      accountId: 'alice.near',
      lockedAmount: '10000000000000000',
      effectiveBoost: '12000000000000000',
      lockMonths: 12,
      totalClaimed: '500000000000000',
      totalCreditsPurchased: '0',
      lastEventType: 'BOOST_LOCK',
      lastEventBlock: 10,
      updatedAt: 1714000000000,
    };
    const samplePurchase = {
      id: 'cp:1',
      blockHeight: 11,
      blockTimestamp: 110,
      receiptId: 'rcpt:2',
      accountId: 'alice.near',
      amount: '1000000000000000',
      infraShare: '600000000000000',
      rewardsShare: '400000000000000',
    };

    it('events filters by eventType array + accountId + success', async () => {
      const { os, fetch } = makeOs({
        data: { boostEvents: [sampleEvent] },
      });
      const rows = await os.query.boost.events({
        eventType: ['BOOST_LOCK', 'BOOST_EXTEND'],
        accountId: 'alice.near',
        success: true,
        limit: 10,
      });
      expect(rows).toEqual([sampleEvent]);

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({
        eventType: ['BOOST_LOCK', 'BOOST_EXTEND'],
        accountId: 'alice.near',
        success: true,
        limit: 10,
        offset: 0,
      });
      expect(body.query).toMatch(/eventType: \{_in: \$eventType\}/);
      expect(body.query).toMatch(/accountId: \{_eq: \$accountId\}/);
      expect(body.query).toMatch(/success: \{_eq: \$success\}/);
    });

    it('state returns first row or null', async () => {
      const { os, fetch } = makeOs({
        data: { boosterState: [sampleState] },
      });
      const state = await os.query.boost.state('alice.near');
      expect(state).toEqual(sampleState);

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({ accountId: 'alice.near' });
    });

    it('state returns null when no rows', async () => {
      const { os } = makeOs({ data: { boosterState: [] } });
      expect(await os.query.boost.state('bob.near')).toBeNull();
    });

    it('topBoosters orders by effectiveBoost DESC', async () => {
      const { os, fetch } = makeOs({
        data: { boosterState: [sampleState] },
      });
      await os.query.boost.topBoosters({ limit: 5 });

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({ limit: 5, offset: 0 });
      expect(body.query).toMatch(/orderBy: \[\{effectiveBoost: DESC\}\]/);
    });

    it('topLocked orders by lockedAmount DESC', async () => {
      const { os, fetch } = makeOs({
        data: { boosterState: [sampleState] },
      });
      await os.query.boost.topLocked({ limit: 5 });

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.query).toMatch(/orderBy: \[\{lockedAmount: DESC\}\]/);
    });

    it('recentLocks applies BOOST_LOCK filter', async () => {
      const { os, fetch } = makeOs({ data: { boostEvents: [] } });
      await os.query.boost.recentLocks({ limit: 25 });

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toMatchObject({
        eventType: 'BOOST_LOCK',
        limit: 25,
      });
    });

    it('recentUnlocks applies BOOST_UNLOCK filter', async () => {
      const { os, fetch } = makeOs({ data: { boostEvents: [] } });
      await os.query.boost.recentUnlocks();

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toMatchObject({ eventType: 'BOOST_UNLOCK' });
    });

    it('recentClaims applies REWARDS_CLAIM filter', async () => {
      const { os, fetch } = makeOs({ data: { boostEvents: [] } });
      await os.query.boost.recentClaims();

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toMatchObject({ eventType: 'REWARDS_CLAIM' });
    });

    it('recentReleases applies REWARDS_RELEASED filter', async () => {
      const { os, fetch } = makeOs({ data: { boostEvents: [] } });
      await os.query.boost.recentReleases();

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toMatchObject({ eventType: 'REWARDS_RELEASED' });
    });

    it('accountActivity narrows by accountId only', async () => {
      const { os, fetch } = makeOs({ data: { boostEvents: [] } });
      await os.query.boost.accountActivity('alice.near', { limit: 20 });

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toMatchObject({
        accountId: 'alice.near',
        limit: 20,
      });
    });

    it('creditPurchases queries the focused table, optionally by account', async () => {
      const { os, fetch } = makeOs({
        data: { boostCreditPurchases: [samplePurchase] },
      });
      const rows = await os.query.boost.creditPurchases({
        accountId: 'alice.near',
        limit: 10,
      });
      expect(rows).toEqual([samplePurchase]);

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.variables).toEqual({
        accountId: 'alice.near',
        limit: 10,
        offset: 0,
      });
      expect(body.query).toMatch(/boostCreditPurchases\(/);
      expect(body.query).toMatch(/accountId: \{_eq: \$accountId\}/);
    });

    it('creditPurchases without accountId omits the where clause', async () => {
      const { os, fetch } = makeOs({
        data: { boostCreditPurchases: [] },
      });
      await os.query.boost.creditPurchases({ limit: 10 });

      const body = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(body.query).not.toMatch(/where:/);
    });

    it('returns [] when the indexer has no matching rows', async () => {
      const { os } = makeOs({ data: { boostEvents: [] } });
      expect(await os.query.boost.events()).toEqual([]);
    });
  });
});
