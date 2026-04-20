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
      const profile = await os.query.getProfile(INDEXED_ACCOUNT);
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
      const page = await os.query.getPosts({ author: ACCOUNT_ID });
      expect(Array.isArray(page.items)).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const page = await os.query.getPosts({
        author: INDEXED_ACCOUNT,
        limit: 2,
      });
      expect(page.items.length).toBeLessThanOrEqual(2);
    });

    it('should return a feed for accounts the user stands with', async () => {
      const feed = await os.query.getFeed({
        standingWith: [INDEXED_ACCOUNT],
        limit: 3,
      });

      expect(Array.isArray(feed.items)).toBe(true);
      expect(feed.items.length).toBeGreaterThan(0);
      expect(feed.items.every((item) => item.accountId === INDEXED_ACCOUNT)).toBe(
        true
      );
    });
  });

  describe('standings', () => {
    it('should fetch standing counts', async () => {
      const counts = await os.query.getStandingCounts(ACCOUNT_ID);
      expect(counts).toBeDefined();
      expect(typeof counts.standers).toBe('number');
      expect(typeof counts.standingWith).toBe('number');
    });

    it('should list who account is standing with', async () => {
      const standingWith = await os.query.getStandingWith(ACCOUNT_ID);
      expect(Array.isArray(standingWith)).toBe(true);
      // Every entry should be a non-empty string (account id)
      for (const acct of standingWith) {
        expect(typeof acct).toBe('string');
        expect(acct.length).toBeGreaterThan(0);
      }
    });

    it('should list standers of a known account', async () => {
      const standers = await os.query.getStanders(INDEXED_ACCOUNT);
      expect(Array.isArray(standers)).toBe(true);
      for (const acct of standers) {
        expect(typeof acct).toBe('string');
        expect(acct.length).toBeGreaterThan(0);
      }
    });

    it('should respect limit parameter', async () => {
      const standingWith = await os.query.getStandingWith(ACCOUNT_ID, {
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
      const result = await confirmIndexed(
        async () => {
          const value = await os.query.dataByType('custom-query', {
            accountId: ACCOUNT_ID,
            limit: 10,
          });
          return value.data?.dataUpdates?.some((row) => row.dataId === customId)
            ? value
            : null;
        },
        'query dataByType',
        { timeoutMs: 30_000, intervalMs: 2_000 }
      );

      const row = result?.data?.dataUpdates?.find((item) => item.dataId === customId);
      expect(row?.accountId).toBe(ACCOUNT_ID);
      expect(row?.dataId).toBe(customId);
      expect(row?.operation).toBe('set');
    }, 35_000);

    it('should fetch a single data entry by full path', async () => {
      const result = await confirmIndexed(
        async () => {
          const value = await os.query.dataByPath(`${ACCOUNT_ID}/${customPath}`);
          return value.data?.dataUpdates?.[0] ? value : null;
        },
        'query dataByPath',
        { timeoutMs: 30_000, intervalMs: 2_000 }
      );

      expect(result?.data?.dataUpdates?.[0]?.path).toBe(`${ACCOUNT_ID}/${customPath}`);
      expect(result?.data?.dataUpdates?.[0]?.dataType).toBe('custom-query');
      expect(result?.data?.dataUpdates?.[0]?.dataId).toBe(customId);
    }, 35_000);
  });

  describe('graph summaries', () => {
    it('should return inbound edge counts for a known account', async () => {
      const result = await confirmIndexed(
        async () => {
          const value = await os.query.edgeCounts(INDEXED_ACCOUNT);
          return value.data?.edgeCounts?.length ? value : null;
        },
        'query edgeCounts',
        { timeoutMs: 30_000, intervalMs: 2_000 }
      );

      const edgeTypes = new Set(
        result?.data?.edgeCounts?.map((row) => row.edgeType) ?? []
      );
      expect(edgeTypes.has('standing')).toBe(true);
      expect(edgeTypes.has('endorsement')).toBe(true);
      expect(edgeTypes.has('claims')).toBe(true);
    }, 35_000);

    it('should return the rewards leaderboard', async () => {
      const result = await os.query.leaderboard({ limit: 3 });

      expect(Array.isArray(result.data?.leaderboardRewards)).toBe(true);
      expect((result.data?.leaderboardRewards?.length ?? 0) > 0).toBe(true);
      expect(typeof result.data?.leaderboardRewards?.[0]?.accountId).toBe('string');
    });

    it('should return token stats', async () => {
      const result = await os.query.tokenStats();

      expect(typeof result.contract).toBe('string');
      expect(result.contract.length).toBeGreaterThan(0);
      expect(typeof result.holders).toBe('number');
      expect(result.holders).toBeGreaterThanOrEqual(0);
      expect(typeof result.source).toBe('string');
    });
  });

  describe('platform stats', () => {
    it('should return profile count', async () => {
      const count = await os.query.getProfileCount();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('should return group count', async () => {
      const count = await os.query.getGroupCount();
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });
});
