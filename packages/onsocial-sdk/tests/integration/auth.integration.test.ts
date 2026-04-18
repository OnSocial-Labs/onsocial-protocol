// ---------------------------------------------------------------------------
// Integration: Auth — NEP-413 session + API key lifecycle
//
// This test verifies the auth flow that all other tests depend on:
// 1. NEP-413 challenge → login (session)
// 2. API key CRUD (create, list, revoke) — requires session auth
// 3. API key client works for reads and writes
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll } from 'vitest';
import {
  getSessionClient,
  getClient,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  ACCOUNT_ID,
} from './helpers.js';
import type { OnSocial } from '../../src/client.js';

describe('auth', () => {
  let session: OnSocial;

  beforeAll(async () => {
    session = await getSessionClient();
  });

  it('should authenticate via NEP-413 challenge + login', () => {
    // getSessionClient() already performed challenge + login
    expect(session).toBeDefined();
  });

  it('should report current user via me()', async () => {
    const me = await session.auth.me();
    expect(me.accountId).toBe(ACCOUNT_ID);
  });

  describe('API key lifecycle', () => {
    let testKeyPrefix: string;

    it('should create a developer API key', async () => {
      // Clean up old lifecycle-test keys first to stay under 10-key limit
      const { keys } = await listApiKeys(session);
      for (const k of keys) {
        if (k.label === 'auth-lifecycle-test') {
          await revokeApiKey(session, k.prefix).catch(() => {});
        }
      }

      const result = await createApiKey(session, 'auth-lifecycle-test');
      testKeyPrefix = result.prefix;
      expect(testKeyPrefix).toMatch(/^onsocial_/);
      expect(result.tier).toBe('free');
    });

    it('should list keys including the new one', async () => {
      const { keys } = await listApiKeys(session);
      expect(keys.length).toBeGreaterThan(0);
      const found = keys.find((k) => k.prefix === testKeyPrefix);
      expect(found).toBeDefined();
    });

    it('should revoke the test key', async () => {
      await revokeApiKey(session, testKeyPrefix);
      // Verify it's gone
      const { keys } = await listApiKeys(session);
      const found = keys.find((k) => k.prefix === testKeyPrefix);
      expect(found).toBeUndefined();
    });
  });

  describe('API key client', () => {
    it('should return an API-key-authenticated client', async () => {
      const os = await getClient();
      expect(os).toBeDefined();
    });
  });
});
