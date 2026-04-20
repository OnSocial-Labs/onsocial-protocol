// ---------------------------------------------------------------------------
// Integration: Social — post, reply, quote, react, standWith, profile, hashtags
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll } from 'vitest';
import {
  ACCOUNT_ID,
  confirmDirect,
  confirmIndexed,
  getClient,
  testId,
} from './helpers.js';
import type { OnSocial } from '../../src/client.js';
import { buildReplySetData, buildQuoteSetData } from '../../src/social.js';

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
        postId
      );
      expect(result.txHash).toBeTruthy();
    });

    it('should expose the post via os.query.getPosts', async () => {
      const page = await confirmIndexed(
        async () => {
          const value = await os.query.getPosts({
            author: ACCOUNT_ID,
            limit: 20,
          });
          return value.items.some((item) => item.postId === postId)
            ? value
            : null;
        },
        'post via getPosts',
        { timeoutMs: 15_000, intervalMs: 2_000 }
      );

      if (!page) throw new Error('post missing from indexed posts');
      expect(page.items.find((item) => item.postId === postId)).toBeDefined();
    }, 20_000);

    it('should verify post landed on-chain via RPC', async () => {
      const entry = await confirmDirect(
        async () => {
          try {
            const e = await os.social.getOne(`post/${postId}`, ACCOUNT_ID);
            return e?.value ? e : null;
          } catch {
            return null;
          }
        },
        'post on-chain',
        { timeoutMs: 15_000, intervalMs: 2_000 }
      );
      expect(entry).toBeDefined();
      if (!entry) throw new Error('post missing from direct read');
      const val =
        typeof entry.value === 'string' ? JSON.parse(entry.value) : entry.value;
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
      const counts = await confirmIndexed(
        async () => {
          const c = await os.query.getReactionCounts(
            ACCOUNT_ID,
            `post/${postId}`
          );
          if (c.like && c.fire) return c;
          return null;
        },
        'reaction counts',
        { timeoutMs: 15_000, intervalMs: 2_000 }
      );
      if (!counts) throw new Error('reaction counts missing');
      expect(counts.like).toBeGreaterThanOrEqual(1);
      expect(counts.fire).toBeGreaterThanOrEqual(1);
      expect(counts.total).toBeGreaterThanOrEqual(2);
    }, 20_000);

    it('should unreact like', async () => {
      const result = await os.social.unreact(
        ACCOUNT_ID,
        'like',
        `post/${postId}`
      );
      expect(result.txHash).toBeTruthy();
    });

    it('should drop like from indexed reaction counts', async () => {
      const counts = await confirmIndexed(
        async () => {
          const value = await os.query.getReactionCounts(
            ACCOUNT_ID,
            `post/${postId}`
          );
          return !value.like && value.fire ? value : null;
        },
        'reaction like removed',
        { timeoutMs: 15_000, intervalMs: 2_000 }
      );

      if (!counts) throw new Error('like reaction still present in index');
      expect(counts.like ?? 0).toBe(0);
      expect(counts.fire).toBeGreaterThanOrEqual(1);
    }, 20_000);

    it('should unreact fire', async () => {
      const result = await os.social.unreact(
        ACCOUNT_ID,
        'fire',
        `post/${postId}`
      );
      expect(result.txHash).toBeTruthy();
    });

    it('should drop all indexed reaction counts after both removals', async () => {
      const counts = await confirmIndexed(
        async () => {
          const value = await os.query.getReactionCounts(
            ACCOUNT_ID,
            `post/${postId}`
          );
          return value.total === 0 ? value : null;
        },
        'all reactions removed',
        { timeoutMs: 15_000, intervalMs: 2_000 }
      );

      if (!counts) throw new Error('reaction counts still present in index');
      expect(counts.total).toBe(0);
      expect(counts.like ?? 0).toBe(0);
      expect(counts.fire ?? 0).toBe(0);
    }, 20_000);
  });

  // ── Reply ─────────────────────────────────────────────────────────────

  describe('reply', () => {
    const replyId = testId();

    it('should write a reply to the parent post', async () => {
      const [path, value] = Object.entries(
        buildReplySetData(
          ACCOUNT_ID,
          postId,
          { text: `Reply ${replyId}` },
          replyId
        )
      )[0];
      const result = await os.social.set(path, JSON.stringify(value));
      expect(result.txHash).toBeTruthy();
    });

    it('should appear in getReplies for the parent post', async () => {
      const replies = await confirmIndexed(
        async () => {
          const r = await os.query.getReplies(ACCOUNT_ID, postId);
          return r.some((x) => x.postId === replyId) ? r : null;
        },
        'reply',
        { timeoutMs: 15_000, intervalMs: 2_000 }
      );
      if (!replies) throw new Error('reply missing from index');
      const reply = replies.find((r) => r.postId === replyId)!;
      expect(reply.accountId).toBe(ACCOUNT_ID);
      expect(reply.parentAuthor).toBe(ACCOUNT_ID);
      expect(reply.parentPath).toBe(`${ACCOUNT_ID}/post/${postId}`);
    }, 20_000);
  });

  // ── Quote ─────────────────────────────────────────────────────────────

  describe('quote', () => {
    const quoteId = testId();

    it('should write a quote of the parent post', async () => {
      const [path, value] = Object.entries(
        buildQuoteSetData(
          ACCOUNT_ID,
          `post/${postId}`,
          { text: `Quote ${quoteId}` },
          quoteId
        )
      )[0];
      const result = await os.social.set(path, JSON.stringify(value));
      expect(result.txHash).toBeTruthy();
    });

    it('should appear in getQuotes for the original post', async () => {
      const quotes = await confirmIndexed(
        async () => {
          const q = await os.query.getQuotes(ACCOUNT_ID, postId);
          return q.some((x) => x.postId === quoteId) ? q : null;
        },
        'quote',
        { timeoutMs: 15_000, intervalMs: 2_000 }
      );
      if (!quotes) throw new Error('quote missing from index');
      const quote = quotes.find((q) => q.postId === quoteId)!;
      expect(quote.accountId).toBe(ACCOUNT_ID);
      expect(quote.refAuthor).toBe(ACCOUNT_ID);
      expect(quote.refPath).toBe(`${ACCOUNT_ID}/post/${postId}`);
    }, 20_000);
  });

  // ── Hashtags ──────────────────────────────────────────────────────────

  describe('hashtags', () => {
    it('should find the post by hashtag via getPostsByHashtag', async () => {
      const page = await confirmIndexed(
        async () => {
          const p = await os.query.getPostsByHashtag('testhashtag', {
            limit: 50,
          });
          return p.items.some((x) => x.postId === postId) ? p : null;
        },
        'hashtag',
        { timeoutMs: 15_000, intervalMs: 2_000 }
      );
      if (!page) throw new Error('hashtag index missing post');
      expect(page.items.find((x) => x.postId === postId)).toBeDefined();
    }, 20_000);

    it('should include testhashtag in getTrendingHashtags', async () => {
      const tags = await os.query.getTrendingHashtags({ limit: 50 });
      expect(tags.some((t) => t.hashtag === 'testhashtag')).toBe(true);
    });

    it('should find testhashtag via searchHashtags prefix', async () => {
      const matches = await os.query.searchHashtags('testhash', { limit: 10 });
      expect(matches.some((m) => m.hashtag === 'testhashtag')).toBe(true);
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
      const standing = await confirmIndexed(
        async () => {
          const list = await os.query.getStandingWith(ACCOUNT_ID);
          return list.includes(standTarget) ? list : null;
        },
        'standWith',
        { timeoutMs: 15_000, intervalMs: 2_000 }
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

    it('should remove the target from standingWith via indexer', async () => {
      const standing = await confirmIndexed(
        async () => {
          const list = await os.query.getStandingWith(ACCOUNT_ID);
          return !list.includes(standTarget) ? list : null;
        },
        'standWith removed',
        { timeoutMs: 15_000, intervalMs: 2_000 }
      );

      if (!standing) throw new Error('standing target still present in index');
      expect(standing).not.toContain(standTarget);
    }, 20_000);
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
      const entry = await confirmDirect(
        async () => {
          try {
            const e = await os.social.getOne(
              `profile/${testField}`,
              ACCOUNT_ID
            );
            return e?.value ? e : null;
          } catch {
            return null;
          }
        },
        'profile on-chain',
        { timeoutMs: 15_000, intervalMs: 2_000 }
      );
      expect(entry).toBeDefined();
      if (!entry) throw new Error('profile missing from direct read');
      expect(entry.value).toBe('integration-value');
    }, 20_000);

    it('should expose the profile field via os.query.getProfile', async () => {
      const profile = await confirmIndexed(
        async () => {
          const value = await os.query.getProfile(ACCOUNT_ID);
          return value?.[testField] === 'integration-value' ? value : null;
        },
        'profile via getProfile',
        { timeoutMs: 15_000, intervalMs: 2_000 }
      );

      if (!profile) throw new Error('profile missing from index');
      expect(profile?.[testField]).toBe('integration-value');
    }, 20_000);
  });
});
