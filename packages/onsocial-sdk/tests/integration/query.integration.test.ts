// ---------------------------------------------------------------------------
// Integration: Query — indexed data reads via Hasura (API key auth)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll } from 'vitest';
import { getClient, ACCOUNT_ID } from './helpers.js';
import type { OnSocial } from '../../src/client.js';

const INDEXED_ACCOUNT = 'onsocial.testnet';

describe('query', () => {
  let os: OnSocial;

  beforeAll(async () => {
    os = await getClient();
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
      const standingWith = await os.query.getStandingWith(ACCOUNT_ID, { limit: 1 });
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
});
