// ---------------------------------------------------------------------------
// Integration: Query — indexed data reads via Hasura (API key auth)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll } from 'vitest';
import { getClient, ACCOUNT_ID, confirmIndexed, testId } from './helpers.js';
import type { OnSocial } from '../../src/client.js';
import {
  buildAttestationSetData,
  buildEndorsementSetData,
} from '../../src/social.js';

const INDEXED_ACCOUNT = 'onsocial.testnet';

describe('query', () => {
  let os: OnSocial;
  const customId = testId();
  const customPath = `custom-query/${customId}`;
  const claimsSubject = INDEXED_ACCOUNT;

  beforeAll(async () => {
    os = await getClient();

    await os.social.set(
      customPath,
      JSON.stringify({ ok: true, id: customId, v: 1, timestamp: Date.now() })
    );

    await os.social.standWith(INDEXED_ACCOUNT);

    for (const [path, value] of Object.entries(
      buildEndorsementSetData(INDEXED_ACCOUNT)
    )) {
      await os.social.set(path, JSON.stringify(value));
    }

    for (const [path, value] of Object.entries(
      buildAttestationSetData(testId(), {
        type: 'query-integration',
        subject: claimsSubject,
      })
    )) {
      await os.social.set(path, JSON.stringify(value));
    }
  });

  describe('limits', () => {
    it('should return tier query limits', async () => {
      const limits = await os.query.getLimits();

      expect(typeof limits.tier).toBe('string');
      expect(limits.limits.maxDepth).toBeGreaterThan(0);
      expect(limits.limits.maxComplexity).toBeGreaterThan(0);
      expect(limits.limits.maxRowLimit).toBeGreaterThan(0);
      expect(typeof limits.limits.allowAggregations).toBe('boolean');
    });
  });

  describe('profiles', () => {
    it('should fetch profile for a known account', async () => {
      const profile = await os.query.profiles.get(INDEXED_ACCOUNT);
      expect(profile).toBeDefined();
      // onsocial.testnet should have at least a name field
      if (profile) {
        const fields = Object.keys(profile);
        expect(fields.length).toBeGreaterThan(0);
      }
    });
  });

  describe('posts', () => {
    it('should fetch posts (may be empty for test account)', async () => {
      const page = await os.query.feed.recent({ author: ACCOUNT_ID });
      expect(Array.isArray(page.items)).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const page = await os.query.feed.recent({
        author: INDEXED_ACCOUNT,
        limit: 2,
      });
      expect(page.items.length).toBeLessThanOrEqual(2);
    });

    it('should return a feed for accounts the user stands with', async () => {
      const feed = await os.query.feed.fromAccounts({
        accounts: [INDEXED_ACCOUNT],
        limit: 3,
      });

      expect(Array.isArray(feed.items)).toBe(true);
      expect(feed.items.length).toBeGreaterThan(0);
      expect(
        feed.items.every((item) => item.accountId === INDEXED_ACCOUNT)
      ).toBe(true);
    });
  });

  describe('standings', () => {
    it('should fetch standing counts', async () => {
      const counts = await os.query.standings.counts(ACCOUNT_ID);
      expect(counts).toBeDefined();
      expect(typeof counts.incoming).toBe('number');
      expect(typeof counts.outgoing).toBe('number');
    });

    it('should list who account is standing with', async () => {
      const standingWith = await os.query.standings.outgoing(ACCOUNT_ID);
      expect(Array.isArray(standingWith)).toBe(true);
      // Every entry should be a non-empty string (account id)
      for (const acct of standingWith) {
        expect(typeof acct).toBe('string');
        expect(acct.length).toBeGreaterThan(0);
      }
    });

    it('should list standers of a known account', async () => {
      const standers = await os.query.standings.incoming(INDEXED_ACCOUNT);
      expect(Array.isArray(standers)).toBe(true);
      for (const acct of standers) {
        expect(typeof acct).toBe('string');
        expect(acct.length).toBeGreaterThan(0);
      }
    });

    it('should respect limit parameter', async () => {
      const standingWith = await os.query.standings.outgoing(ACCOUNT_ID, {
        limit: 1,
      });
      expect(standingWith.length).toBeLessThanOrEqual(1);
    });
  });

  describe('raw graphql', () => {
    it('should execute a raw graphql query', async () => {
      const result = await os.query.graphql<{ dataUpdates: unknown[] }>({
        query: `query($id: String!) {
          dataUpdates(where: {accountId: {_eq: $id}}, limit: 5, orderBy: [{blockHeight: DESC}]) {
            path value accountId blockHeight
          }
        }`,
        variables: { id: INDEXED_ACCOUNT },
      });
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data?.dataUpdates)).toBe(true);
    });
  });

  describe('custom indexed data', () => {
    it('should fetch data by type for the account', async () => {
      const row = await confirmIndexed(
        async () => {
          const rows = await os.query.raw.byType('custom-query', {
            accountId: ACCOUNT_ID,
            limit: 10,
          });
          return rows.find((r) => r.dataId === customId) ?? null;
        },
        'query raw.byType',
        { timeoutMs: 30_000, intervalMs: 2_000 }
      );

      expect(row?.accountId).toBe(ACCOUNT_ID);
      expect(row?.dataId).toBe(customId);
      expect(row?.operation).toBe('set');
    }, 35_000);

    it('should fetch a single data entry by full path', async () => {
      const row = await confirmIndexed(
        async () => {
          const r = await os.query.raw.byPath(`${ACCOUNT_ID}/${customPath}`);
          return r ?? null;
        },
        'query raw.byPath',
        { timeoutMs: 30_000, intervalMs: 2_000 }
      );

      expect(row?.path).toBe(`${ACCOUNT_ID}/${customPath}`);
      expect(row?.dataType).toBe('custom-query');
      expect(row?.dataId).toBe(customId);
    }, 35_000);

    it('should filter by inner JSON field via valueJson containment', async () => {
      const dataType = `jsoncontains-${testId()}`;
      const matchingId = testId();
      const otherId = testId();
      const tag = `tag-${testId()}`;

      await os.social.set(
        `${dataType}/${matchingId}`,
        JSON.stringify({ tag, score: 99, level: 7 })
      );
      await os.social.set(
        `${dataType}/${otherId}`,
        JSON.stringify({ tag: 'unrelated', score: 1, level: 1 })
      );

      const matched = await confirmIndexed(
        async () => {
          const rows = await os.query.raw.byJsonContains(
            dataType,
            { tag },
            { accountId: ACCOUNT_ID, limit: 10 }
          );
          return rows.find((r) => r.dataId === matchingId) ?? null;
        },
        'query raw.byJsonContains',
        { timeoutMs: 30_000, intervalMs: 2_000 }
      );

      expect(matched?.accountId).toBe(ACCOUNT_ID);
      expect(matched?.dataId).toBe(matchingId);
      expect(matched?.dataType).toBe(dataType);

      const parsed = JSON.parse(matched!.value) as {
        tag: string;
        score: number;
        level: number;
      };
      expect(parsed.tag).toBe(tag);
      expect(parsed.level).toBe(7);

      // Sanity: containment with a non-matching predicate returns no rows
      // for the matching id.
      const noise = await os.query.raw.byJsonContains(
        dataType,
        { tag: 'definitely-not-present' },
        { accountId: ACCOUNT_ID, limit: 10 }
      );
      expect(noise.find((r) => r.dataId === matchingId)).toBeUndefined();
    }, 45_000);
  });

  describe('graph summaries', () => {
    it('should return inbound edge counts for a known account', async () => {
      const rows = await confirmIndexed(
        async () => {
          const r = await os.query.stats.edges(INDEXED_ACCOUNT);
          return r.length ? r : null;
        },
        'query stats.edges',
        { timeoutMs: 30_000, intervalMs: 2_000 }
      );

      const edgeTypes = new Set(rows?.map((row) => row.edgeType) ?? []);
      expect(edgeTypes.has('standing')).toBe(true);
      expect(edgeTypes.has('endorsement')).toBe(true);
      expect(edgeTypes.has('claims')).toBe(true);
    }, 35_000);

    it('should return the rewards leaderboard', async () => {
      const rows = await os.query.stats.leaderboard({ limit: 3 });

      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBeGreaterThan(0);
      expect(typeof rows[0]?.accountId).toBe('string');
    });

    it('should return token stats', async () => {
      const result = await os.query.stats.tokenStats();

      expect(typeof result.contract).toBe('string');
      expect(result.contract.length).toBeGreaterThan(0);
      expect(typeof result.holders).toBe('number');
      expect(result.holders).toBeGreaterThanOrEqual(0);
      expect(typeof result.source).toBe('string');
    });
  });

  describe('platform stats', () => {
    it('should return profile count', async () => {
      const count = await os.query.stats.profileCount();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('should return group count', async () => {
      const count = await os.query.stats.groupCount();
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });
});
