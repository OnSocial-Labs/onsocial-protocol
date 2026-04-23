// ---------------------------------------------------------------------------
// Integration: Social — post, reply, quote, react, standWith, profile, hashtags
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll } from 'vitest';
import {
  ACCOUNT_ID,
  confirmDirect,
  confirmIndexed,
  getClient,
  testAudioBlob,
  testImageBlob,
  testId,
} from './helpers.js';
import type { OnSocial } from '../../src/client.js';

describe('social', () => {
  let os: OnSocial;
  const postId = testId();
  const imagePostId = testId();

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
        { timeoutMs: 30_000, intervalMs: 2_000 }
      );

      if (!page) throw new Error('post missing from indexed posts');
      expect(page.items.find((item) => item.postId === postId)).toBeDefined();
    }, 35_000);

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
        { timeoutMs: 30_000, intervalMs: 2_000 }
      );
      expect(entry).toBeDefined();
      if (!entry) throw new Error('post missing from direct read');
      const val =
        typeof entry.value === 'string' ? JSON.parse(entry.value) : entry.value;
      expect(val.text).toContain(postId);
    }, 35_000);

    it('should upload a post image Blob and store an ipfs media URL', async () => {
      const result = await os.social.post(
        {
          text: `Blob image integration ${imagePostId}`,
          image: testImageBlob(),
        },
        imagePostId
      );
      expect(result.txHash).toBeTruthy();
    });

    it('should verify blob-backed post media landed on-chain via RPC', async () => {
      const entry = await confirmDirect(
        async () => {
          try {
            const e = await os.social.getOne(`post/${imagePostId}`, ACCOUNT_ID);
            return e?.value ? e : null;
          } catch {
            return null;
          }
        },
        'blob post on-chain',
        { timeoutMs: 20_000, intervalMs: 2_000 }
      );

      expect(entry).toBeDefined();
      if (!entry) throw new Error('blob post missing from direct read');

      const val =
        typeof entry.value === 'string' ? JSON.parse(entry.value) : entry.value;
      expect(val.text).toContain(imagePostId);
      expect(Array.isArray(val.media)).toBe(true);
      expect(val.media[0]).toMatch(/^ipfs:\/\//);
      expect(val.image).toBeUndefined();
    }, 25_000);

    it('should expose blob-backed post media via os.query.getPosts', async () => {
      const page = await confirmIndexed(
        async () => {
          const value = await os.query.getPosts({
            author: ACCOUNT_ID,
            limit: 20,
          });
          return value.items.some((item) => item.postId === imagePostId)
            ? value
            : null;
        },
        'blob post via getPosts',
        { timeoutMs: 20_000, intervalMs: 2_000 }
      );

      if (!page) throw new Error('blob post missing from indexed posts');
      const post = page.items.find((item) => item.postId === imagePostId);
      expect(post).toBeDefined();
      if (!post) throw new Error('blob post missing from indexed page');

      const value = JSON.parse(post.value);
      expect(Array.isArray(value.media)).toBe(true);
      expect(value.media[0]).toMatch(/^ipfs:\/\//);
    }, 25_000);
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
        { timeoutMs: 30_000, intervalMs: 2_000 }
      );
      if (!counts) throw new Error('reaction counts missing');
      expect(counts.like).toBeGreaterThanOrEqual(1);
      expect(counts.fire).toBeGreaterThanOrEqual(1);
      expect(counts.total).toBeGreaterThanOrEqual(2);
    }, 35_000);

    it('should expose current reactions via os.query.reactions', async () => {
      const reactions = await confirmIndexed(
        async () => {
          const result = await os.query.reactions(ACCOUNT_ID, `post/${postId}`);
          const rows = result.data?.reactionsCurrent ?? [];
          const types = rows
            .map((row) => {
              try {
                const value = JSON.parse(row.value);
                return value?.type;
              } catch {
                return null;
              }
            })
            .filter(Boolean);
          return types.includes('like') && types.includes('fire') ? rows : null;
        },
        'query reactions',
        { timeoutMs: 30_000, intervalMs: 2_000 }
      );

      if (!reactions) throw new Error('query.reactions missing expected rows');
      expect(
        reactions.some((row) => row.path.includes(`/like/post/${postId}`))
      ).toBe(true);
      expect(
        reactions.some((row) => row.path.includes(`/fire/post/${postId}`))
      ).toBe(true);
    }, 35_000);

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
        { timeoutMs: 30_000, intervalMs: 2_000 }
      );

      if (!counts) throw new Error('like reaction still present in index');
      expect(counts.like ?? 0).toBe(0);
      expect(counts.fire).toBeGreaterThanOrEqual(1);
    }, 35_000);

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
        { timeoutMs: 30_000, intervalMs: 2_000 }
      );

      if (!counts) throw new Error('reaction counts still present in index');
      expect(counts.total).toBe(0);
      expect(counts.like ?? 0).toBe(0);
      expect(counts.fire ?? 0).toBe(0);
    }, 35_000);
  });

  // ── Reply ─────────────────────────────────────────────────────────────

  describe('reply', () => {
    const replyId = testId();

    it('should write a reply to the parent post', async () => {
      const result = await os.social.reply(
        ACCOUNT_ID,
        postId,
        { text: `Reply ${replyId}` },
        replyId
      );
      expect(result.txHash).toBeTruthy();
    });

    it('should appear in getReplies for the parent post', async () => {
      const replies = await confirmIndexed(
        async () => {
          const r = await os.query.getReplies(ACCOUNT_ID, postId);
          return r.some((x) => x.postId === replyId) ? r : null;
        },
        'reply',
        { timeoutMs: 30_000, intervalMs: 2_000 }
      );
      if (!replies) throw new Error('reply missing from index');
      const reply = replies.find((r) => r.postId === replyId)!;
      expect(reply.accountId).toBe(ACCOUNT_ID);
      expect(reply.parentAuthor).toBe(ACCOUNT_ID);
      expect(reply.parentPath).toBe(`${ACCOUNT_ID}/post/${postId}`);
    }, 35_000);

    it('should expose the reply via direct read', async () => {
      const entry = await confirmDirect(
        async () => {
          try {
            const value = await os.social.getOne(`post/${replyId}`, ACCOUNT_ID);
            return value?.value ? value : null;
          } catch {
            return null;
          }
        },
        'reply direct read',
        { timeoutMs: 30_000, intervalMs: 2_000 }
      );

      if (!entry) throw new Error('reply missing from direct read');
      const value =
        typeof entry.value === 'string' ? JSON.parse(entry.value) : entry.value;
      expect(value.text).toContain(replyId);
    }, 35_000);
  });

  // ── Quote ─────────────────────────────────────────────────────────────

  describe('quote', () => {
    const quoteId = testId();

    it('should write a quote of the parent post', async () => {
      const result = await os.social.quote(
        ACCOUNT_ID,
        `post/${postId}`,
        { text: `Quote ${quoteId}` },
        quoteId
      );
      expect(result.txHash).toBeTruthy();
    });

    it('should appear in getQuotes for the original post', async () => {
      const quotes = await confirmIndexed(
        async () => {
          const q = await os.query.getQuotes(ACCOUNT_ID, postId);
          return q.some((x) => x.postId === quoteId) ? q : null;
        },
        'quote',
        { timeoutMs: 30_000, intervalMs: 2_000 }
      );
      if (!quotes) throw new Error('quote missing from index');
      const quote = quotes.find((q) => q.postId === quoteId)!;
      expect(quote.accountId).toBe(ACCOUNT_ID);
      expect(quote.refAuthor).toBe(ACCOUNT_ID);
      expect(quote.refPath).toBe(`${ACCOUNT_ID}/post/${postId}`);
    }, 35_000);

    it('should expose the quote via direct read', async () => {
      const entry = await confirmDirect(
        async () => {
          try {
            const value = await os.social.getOne(`post/${quoteId}`, ACCOUNT_ID);
            return value?.value ? value : null;
          } catch {
            return null;
          }
        },
        'quote direct read',
        { timeoutMs: 30_000, intervalMs: 2_000 }
      );

      if (!entry) throw new Error('quote missing from direct read');
      const value =
        typeof entry.value === 'string' ? JSON.parse(entry.value) : entry.value;
      expect(value.text).toContain(quoteId);
    }, 35_000);
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
        { timeoutMs: 30_000, intervalMs: 2_000 }
      );
      if (!page) throw new Error('hashtag index missing post');
      expect(page.items.find((x) => x.postId === postId)).toBeDefined();
    }, 35_000);

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
        { timeoutMs: 30_000, intervalMs: 2_000 }
      );
      expect(standing).toContain(standTarget);
    }, 35_000);

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
        { timeoutMs: 30_000, intervalMs: 2_000 }
      );

      if (!standing) throw new Error('standing target still present in index');
      expect(standing).not.toContain(standTarget);
    }, 35_000);
  });

  // ── Profile ───────────────────────────────────────────────────────────

  describe('profile', () => {
    const testField = `int_test_${Date.now()}`;
    const avatarField = `avatar_blob_${testId()}`;

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
        { timeoutMs: 30_000, intervalMs: 2_000 }
      );
      expect(entry).toBeDefined();
      if (!entry) throw new Error('profile missing from direct read');
      expect(entry.value).toBe('integration-value');
    }, 35_000);

    it('should expose the profile field via os.query.getProfile', async () => {
      const profile = await confirmIndexed(
        async () => {
          const value = await os.query.getProfile(ACCOUNT_ID);
          return value?.[testField] === 'integration-value' ? value : null;
        },
        'profile via getProfile',
        { timeoutMs: 30_000, intervalMs: 2_000 }
      );

      if (!profile) throw new Error('profile missing from index');
      expect(profile?.[testField]).toBe('integration-value');
    }, 35_000);

    it('should upload an avatar Blob and store an ipfs URL', async () => {
      const result = await os.social.setProfile({
        [avatarField]: 'blob-avatar-test',
        avatar: testImageBlob(),
      });
      expect(result.txHash).toBeTruthy();
    });

    it('should verify avatar Blob landed on-chain via RPC', async () => {
      const entry = await confirmDirect(
        async () => {
          try {
            const e = await os.social.getOne('profile/avatar', ACCOUNT_ID);
            return typeof e?.value === 'string' && e.value.startsWith('ipfs://')
              ? e
              : null;
          } catch {
            return null;
          }
        },
        'profile avatar on-chain',
        { timeoutMs: 20_000, intervalMs: 2_000 }
      );

      expect(entry).toBeDefined();
      if (!entry) throw new Error('profile avatar missing from direct read');
      expect(entry.value).toMatch(/^ipfs:\/\//);
    }, 25_000);

    it('should expose the avatar ipfs URL via os.query.getProfile', async () => {
      const profile = await confirmIndexed(
        async () => {
          const value = await os.query.getProfile(ACCOUNT_ID);
          return typeof value?.avatar === 'string' &&
            value.avatar.startsWith('ipfs://') &&
            value?.[avatarField] === 'blob-avatar-test'
            ? value
            : null;
        },
        'profile avatar via getProfile',
        { timeoutMs: 20_000, intervalMs: 2_000 }
      );

      if (!profile) throw new Error('profile avatar missing from index');
      expect(profile.avatar).toMatch(/^ipfs:\/\//);
    }, 25_000);
  });

  // ── Direct Reads ─────────────────────────────────────────────────────

  describe('direct reads', () => {
    const readNamespace = `sdk_direct_reads_${testId()}`;
    const firstPath = `${readNamespace}/alpha`;
    const secondPath = `${readNamespace}/beta`;

    it('should write direct-read fixture data', async () => {
      const [first, second] = await Promise.all([
        os.social.set(
          firstPath,
          JSON.stringify({ ok: true, slot: 'alpha', value: 'value-alpha' })
        ),
        os.social.set(secondPath, JSON.stringify({ ok: true, slot: 'beta' })),
      ]);

      expect(first.txHash).toBeTruthy();
      expect(second.txHash).toBeTruthy();
    }, 35_000);

    it('should read multiple entries via social.get', async () => {
      const entries = await confirmDirect(
        async () => {
          const value = await os.social.get(
            [firstPath, secondPath],
            ACCOUNT_ID
          );
          const alpha = value.find(
            (entry) => entry.requested_key === firstPath
          );
          const beta = value.find(
            (entry) => entry.requested_key === secondPath
          );
          return alpha?.value && beta?.value ? value : null;
        },
        'direct get multiple keys',
        { timeoutMs: 30_000, intervalMs: 2_000 }
      );

      if (!entries) throw new Error('direct get returned incomplete entries');

      const alpha = entries.find((entry) => entry.requested_key === firstPath);
      const beta = entries.find((entry) => entry.requested_key === secondPath);

      const alphaValue =
        typeof alpha?.value === 'string'
          ? JSON.parse(alpha.value)
          : alpha?.value;
      expect(alpha?.full_key).toBe(`${ACCOUNT_ID}/${firstPath}`);
      expect(alphaValue).toEqual({
        ok: true,
        slot: 'alpha',
        value: 'value-alpha',
      });
      expect(alpha?.deleted).toBe(false);

      const betaValue =
        typeof beta?.value === 'string' ? JSON.parse(beta.value) : beta?.value;
      expect(beta?.full_key).toBe(`${ACCOUNT_ID}/${secondPath}`);
      expect(betaValue).toEqual({ ok: true, slot: 'beta' });
      expect(beta?.deleted).toBe(false);
    }, 35_000);

    it('should list matching keys via social.listKeys', async () => {
      const keys = await confirmDirect(
        async () => {
          const value = await os.social.listKeys({
            prefix: `${ACCOUNT_ID}/${readNamespace}/`,
            limit: 10,
            withValues: true,
          });
          const matches = value.filter((entry) =>
            [firstPath, secondPath].some(
              (path) => entry.key === `${ACCOUNT_ID}/${path}`
            )
          );
          return matches.length === 2 ? value : null;
        },
        'direct list keys',
        { timeoutMs: 30_000, intervalMs: 2_000 }
      );

      if (!keys) throw new Error('direct listKeys missing expected keys');

      const listedKeys = keys.map((entry) => entry.key);
      expect(listedKeys).toContain(`${ACCOUNT_ID}/${firstPath}`);
      expect(listedKeys).toContain(`${ACCOUNT_ID}/${secondPath}`);

      const alpha = keys.find(
        (entry) => entry.key === `${ACCOUNT_ID}/${firstPath}`
      );
      const beta = keys.find(
        (entry) => entry.key === `${ACCOUNT_ID}/${secondPath}`
      );
      const alphaValue =
        typeof alpha?.value === 'string'
          ? JSON.parse(alpha.value)
          : alpha?.value;
      expect(alphaValue).toEqual({
        ok: true,
        slot: 'alpha',
        value: 'value-alpha',
      });
      const betaValue =
        typeof beta?.value === 'string' ? JSON.parse(beta.value) : beta?.value;
      expect(betaValue).toEqual({ ok: true, slot: 'beta' });
    }, 35_000);

    it('should count matching keys via social.countKeys', async () => {
      const count = await confirmDirect(
        async () => {
          const value = await os.social.countKeys(
            `${ACCOUNT_ID}/${readNamespace}/`
          );
          return value.count >= 2 ? value : null;
        },
        'direct count keys',
        { timeoutMs: 30_000, intervalMs: 2_000 }
      );

      expect(count?.count).toBeGreaterThanOrEqual(2);
    }, 35_000);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Feed metadata + files[] — round-trip through substreams → Hasura.
  //
  // These tests assert that `channel`, `kind`, `audiences`, and uploaded
  // `files` all land in the right indexed columns (exposed by os.query)
  // AND in the right places in the raw on-chain JSON value.
  // ─────────────────────────────────────────────────────────────────────

  describe('feed metadata & files round-trip', () => {
    const channelPostId = testId();
    const audioPostId = testId();
    const longformPostId = testId();
    const multiFilePostId = testId();

    it('should persist channel, kind, audiences in indexed columns', async () => {
      const result = await os.posts.create(
        {
          text: `feed-meta ${channelPostId}`,
          channel: 'music',
          audiences: ['public'],
        },
        channelPostId
      );
      expect(result.txHash).toBeTruthy();

      const row = await confirmIndexed(
        async () => {
          const page = await os.query.getPosts({
            author: ACCOUNT_ID,
            limit: 20,
          });
          return page.items.find((p) => p.postId === channelPostId) ?? null;
        },
        'feed-meta post indexed',
        { timeoutMs: 30_000, intervalMs: 3_000 }
      );

      expect(row).toBeDefined();
      if (!row) throw new Error('feed-meta post missing from index');
      expect(row.channel).toBe('music');
      expect(row.kind).toBe('text');
      // `audiences` is stored as a normalized comma-separated string column
      // by substreams — assert it at least contains the value we wrote.
      expect(row.audiences).toContain('public');

      // On-chain JSON should also round-trip the same values.
      const entry = await os.social.getOne(`post/${channelPostId}`, ACCOUNT_ID);
      const val =
        typeof entry.value === 'string' ? JSON.parse(entry.value) : entry.value;
      expect(val.channel).toBe('music');
      expect(val.kind).toBe('text');
      expect(val.audiences).toEqual(['public']);
    }, 45_000);

    it('should surface channel-filtered posts via getFilteredFeed', async () => {
      const page = await confirmIndexed(
        async () => {
          const res = await os.query.getFilteredFeed({
            standingWith: [ACCOUNT_ID],
            channel: 'music',
            limit: 20,
          });
          return res.items.some((p) => p.postId === channelPostId) ? res : null;
        },
        'music channel feed',
        { timeoutMs: 30_000, intervalMs: 3_000 }
      );
      if (!page) throw new Error('music channel post missing from feed');
      // Every row in a channel-filtered feed must actually be in that channel.
      expect(page.items.every((p) => p.channel === 'music')).toBe(true);
    }, 45_000);

    it('should infer kind=audio from uploaded audio file and index MediaRef', async () => {
      const result = await os.posts.create(
        {
          text: `audio ${audioPostId}`,
          files: [testAudioBlob()],
        },
        audioPostId
      );
      expect(result.txHash).toBeTruthy();

      // Raw on-chain value: media[0] should be a MediaRef object (not a
      // bare ipfs:// string) because it came through the provider.
      const entry = await confirmDirect(
        async () => {
          try {
            const e = await os.social.getOne(`post/${audioPostId}`, ACCOUNT_ID);
            return e?.value ? e : null;
          } catch {
            return null;
          }
        },
        'audio post on-chain',
        { timeoutMs: 20_000, intervalMs: 2_000 }
      );
      if (!entry) throw new Error('audio post missing from on-chain read');
      const val =
        typeof entry.value === 'string' ? JSON.parse(entry.value) : entry.value;
      expect(val.kind).toBe('audio');
      expect(Array.isArray(val.media)).toBe(true);
      expect(val.media.length).toBe(1);
      const ref = val.media[0];
      expect(typeof ref).toBe('object');
      expect(ref.cid).toBeTruthy();
      expect(ref.mime).toMatch(/^audio\//);
      expect(typeof ref.size).toBe('number');
      expect(val.files).toBeUndefined();

      // Indexed side: kind column should be 'audio'.
      const row = await confirmIndexed(
        async () => {
          const page = await os.query.getPosts({
            author: ACCOUNT_ID,
            limit: 20,
          });
          return page.items.find((p) => p.postId === audioPostId) ?? null;
        },
        'audio post indexed',
        { timeoutMs: 30_000, intervalMs: 3_000 }
      );
      if (!row) throw new Error('audio post missing from index');
      expect(row.kind).toBe('audio');
    }, 60_000);

    it('should surface kind-filtered posts via getFilteredFeed', async () => {
      const page = await confirmIndexed(
        async () => {
          const res = await os.query.getFilteredFeed({
            standingWith: [ACCOUNT_ID],
            kind: 'audio',
            limit: 20,
          });
          return res.items.some((p) => p.postId === audioPostId) ? res : null;
        },
        'audio kind feed',
        { timeoutMs: 30_000, intervalMs: 3_000 }
      );
      if (!page) throw new Error('audio post missing from kind-filtered feed');
      expect(page.items.every((p) => p.kind === 'audio')).toBe(true);
    }, 45_000);

    it('should preserve media ordering across multi-file uploads', async () => {
      const result = await os.posts.create(
        {
          text: `multi-file ${multiFilePostId}`,
          files: [testImageBlob(), testAudioBlob()],
        },
        multiFilePostId
      );
      expect(result.txHash).toBeTruthy();

      const entry = await confirmDirect(
        async () => {
          try {
            const e = await os.social.getOne(
              `post/${multiFilePostId}`,
              ACCOUNT_ID
            );
            return e?.value ? e : null;
          } catch {
            return null;
          }
        },
        'multi-file post on-chain',
        { timeoutMs: 20_000, intervalMs: 2_000 }
      );
      if (!entry) throw new Error('multi-file post missing from on-chain read');
      const val =
        typeof entry.value === 'string' ? JSON.parse(entry.value) : entry.value;
      expect(val.media.length).toBe(2);
      expect(val.media[0].mime).toMatch(/^image\//);
      expect(val.media[1].mime).toMatch(/^audio\//);
      // image comes first → kind should infer to 'video'/'audio' only if
      // *any* audio is present; inferKind picks audio over image → 'audio'.
      expect(val.kind).toBe('audio');
    }, 60_000);

    it('should infer kind=longform when text > 1500 chars', async () => {
      const longText = 'x'.repeat(1600) + ` ${longformPostId}`;
      const result = await os.posts.create({ text: longText }, longformPostId);
      expect(result.txHash).toBeTruthy();

      const row = await confirmIndexed(
        async () => {
          const page = await os.query.getPosts({
            author: ACCOUNT_ID,
            limit: 20,
          });
          return page.items.find((p) => p.postId === longformPostId) ?? null;
        },
        'longform post indexed',
        { timeoutMs: 30_000, intervalMs: 3_000 }
      );
      if (!row) throw new Error('longform post missing from index');
      expect(row.kind).toBe('longform');
    }, 45_000);
  });
});
