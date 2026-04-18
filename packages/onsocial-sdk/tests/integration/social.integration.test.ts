// ---------------------------------------------------------------------------
// Integration: Social — post, react, standWith, profile
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll } from 'vitest';
import { getClient, testId, waitFor, ACCOUNT_ID } from './helpers.js';
import type { OnSocial } from '../../src/client.js';

describe('social', () => {
  let os: OnSocial;
  const postId = testId();

  beforeAll(async () => {
    os = await getClient();
  });

  // ── Post ──────────────────────────────────────────────────────────────

  describe('post', () => {
    it('should create a post with hashtags', async () => {
      const result = await os.social.post(
        {
          text: `Integration test ${postId} #testhashtag`,
          hashtags: ['testhashtag'],
        },
        postId,
      );
      expect(result.txHash).toBeTruthy();
    });

    it('should verify post landed on-chain via RPC', async () => {
      const entry = await waitFor(
        async () => {
          try {
            const e = await os.social.getOne(`post/${postId}`, ACCOUNT_ID);
            return e?.value ? e : null;
          } catch { return null; }
        },
        { timeoutMs: 15_000, intervalMs: 2_000, label: 'post on-chain' },
      );
      expect(entry).toBeDefined();
      const val = typeof entry.value === 'string' ? JSON.parse(entry.value) : entry.value;
      expect(val.text).toContain(postId);
    }, 20_000);
  });

  // ── React ─────────────────────────────────────────────────────────────

  describe('react', () => {
    it('should react with like', async () => {
      const result = await os.social.react(ACCOUNT_ID, `post/${postId}`, {
        type: 'like',
      });
      expect(result.txHash).toBeTruthy();
    });

    it('should react with fire (multiple kinds on same post)', async () => {
      const result = await os.social.react(ACCOUNT_ID, `post/${postId}`, {
        type: 'fire',
      });
      expect(result.txHash).toBeTruthy();
    });

    it('should see reaction counts per kind via indexer', async () => {
      const counts = await waitFor(
        async () => {
          const c = await os.query.getReactionCounts(ACCOUNT_ID, `post/${postId}`);
          if (c.like && c.fire) return c;
          return null;
        },
        { timeoutMs: 15_000, intervalMs: 2_000, label: 'reaction counts indexed' },
      );
      expect(counts.like).toBeGreaterThanOrEqual(1);
      expect(counts.fire).toBeGreaterThanOrEqual(1);
      expect(counts.total).toBeGreaterThanOrEqual(2);
    }, 20_000);

    it('should unreact like', async () => {
      const result = await os.social.unreact(
        ACCOUNT_ID,
        'like',
        `post/${postId}`,
      );
      expect(result.txHash).toBeTruthy();
    });

    it('should unreact fire', async () => {
      const result = await os.social.unreact(
        ACCOUNT_ID,
        'fire',
        `post/${postId}`,
      );
      expect(result.txHash).toBeTruthy();
    });
  });

  // ── StandWith ─────────────────────────────────────────────────────────

  describe('standWith', () => {
    const standTarget = 'onsocial.testnet';

    it('should stand with another account', async () => {
      const result = await os.social.standWith(standTarget);
      expect(result.txHash).toBeTruthy();
    });

    it('should appear in standingWith list via indexer', async () => {
      const standing = await waitFor(
        async () => {
          const list = await os.query.getStandingWith(ACCOUNT_ID);
          return list.includes(standTarget) ? list : null;
        },
        { timeoutMs: 15_000, intervalMs: 2_000, label: 'standWith indexed' },
      );
      expect(standing).toContain(standTarget);
    }, 20_000);

    it('should appear in standers list of target', async () => {
      const standers = await os.query.getStanders(standTarget);
      expect(standers).toContain(ACCOUNT_ID);
    });

    it('should reflect in standing counts', async () => {
      const counts = await os.query.getStandingCounts(ACCOUNT_ID);
      expect(counts.standingWith).toBeGreaterThanOrEqual(1);
    });

    it('should unstand', async () => {
      const result = await os.social.unstand(standTarget);
      expect(result.txHash).toBeTruthy();
    });
  });

  // ── Profile ───────────────────────────────────────────────────────────

  describe('profile', () => {
    const testField = `int_test_${Date.now()}`;

    it('should write a profile field', async () => {
      const result = await os.social.setProfile({
        [testField]: 'integration-value',
      });
      expect(result.txHash).toBeTruthy();
    });

    it('should verify profile field landed on-chain via RPC', async () => {
      const entry = await waitFor(
        async () => {
          try {
            const e = await os.social.getOne(`profile/${testField}`, ACCOUNT_ID);
            return e?.value ? e : null;
          } catch { return null; }
        },
        { timeoutMs: 15_000, intervalMs: 2_000, label: 'profile on-chain' },
      );
      expect(entry).toBeDefined();
      expect(entry.value).toBe('integration-value');
    }, 20_000);
  });
});
