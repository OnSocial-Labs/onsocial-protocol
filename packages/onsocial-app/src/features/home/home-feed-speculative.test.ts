import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Paginated, PostRow } from '@onsocial/sdk';
import {
  shouldAdoptSpeculativeFeedPage,
  shouldRequestSpeculativeFeedPage,
  shouldSeedHomeFeedPage,
  speculativeFeedKeepsPaint,
} from './home-feed-speculative';

function page(items: number): Paginated<PostRow> {
  return {
    items: Array.from({ length: items }, (_, index) => ({
      accountId: 'a.near',
      postId: String(index),
      value: '{"text":"hi"}',
      blockHeight: index + 1,
      blockTimestamp: 1,
    })),
    nextOffset: items,
  };
}

describe('shouldRequestSpeculativeFeedPage', () => {
  it('fires only for a cold global first visit', () => {
    expect(
      shouldRequestSpeculativeFeedPage({
        restoredSession: null,
        initialPage: null,
        hasFocus: false,
      })
    ).toBe(true);
    expect(
      shouldRequestSpeculativeFeedPage({
        restoredSession: { posts: [] },
        initialPage: null,
        hasFocus: false,
      })
    ).toBe(false);
    expect(
      shouldRequestSpeculativeFeedPage({
        restoredSession: null,
        initialPage: page(24),
        hasFocus: false,
      })
    ).toBe(false);
    expect(
      shouldRequestSpeculativeFeedPage({
        restoredSession: null,
        initialPage: null,
        hasFocus: true,
      })
    ).toBe(false);
  });
});

describe('shouldAdoptSpeculativeFeedPage', () => {
  const base = {
    speculativePage: page(24),
    initialPage: null,
    hasFocus: false,
    postsLength: 0,
    bootstrapDone: false,
  };

  it('adopts onto an empty, un-bootstrapped list', () => {
    expect(shouldAdoptSpeculativeFeedPage(base)).toBe(true);
  });

  it('never paints over live rows, a bootstrapped feed, a focus, or SSR', () => {
    expect(
      shouldAdoptSpeculativeFeedPage({ ...base, postsLength: 3 })
    ).toBe(false);
    expect(
      shouldAdoptSpeculativeFeedPage({ ...base, bootstrapDone: true })
    ).toBe(false);
    expect(shouldAdoptSpeculativeFeedPage({ ...base, hasFocus: true })).toBe(
      false
    );
    expect(
      shouldAdoptSpeculativeFeedPage({ ...base, initialPage: page(24) })
    ).toBe(false);
    expect(
      shouldAdoptSpeculativeFeedPage({ ...base, speculativePage: null })
    ).toBe(false);
  });
});

describe('shouldSeedHomeFeedPage', () => {
  it('seeds a document load and a first in-app open', () => {
    expect(
      shouldSeedHomeFeedPage({
        rscHeader: null,
        hasFocus: false,
        hasSavedList: false,
      })
    ).toBe(true);
    expect(
      shouldSeedHomeFeedPage({
        rscHeader: null,
        hasFocus: false,
        hasSavedList: true,
      })
    ).toBe(true);
    expect(
      shouldSeedHomeFeedPage({
        rscHeader: '1',
        hasFocus: false,
        hasSavedList: false,
      })
    ).toBe(true);
  });

  it('skips an in-app return that already has a saved list, and any focused URL', () => {
    expect(
      shouldSeedHomeFeedPage({
        rscHeader: '1',
        hasFocus: false,
        hasSavedList: true,
      })
    ).toBe(false);
    expect(
      shouldSeedHomeFeedPage({
        rscHeader: null,
        hasFocus: true,
        hasSavedList: false,
      })
    ).toBe(false);
    expect(
      shouldSeedHomeFeedPage({
        rscHeader: '1',
        hasFocus: true,
        hasSavedList: false,
      })
    ).toBe(false);
  });
});

describe('speculativeFeedKeepsPaint', () => {
  it('keeps the speculative page only for global hot', () => {
    expect(speculativeFeedKeepsPaint('global', 'hot')).toBe(true);
    expect(speculativeFeedKeepsPaint('global', 'recent')).toBe(false);
    expect(speculativeFeedKeepsPaint('pulse', 'hot')).toBe(false);
    expect(speculativeFeedKeepsPaint('circle', 'hot')).toBe(false);
    expect(speculativeFeedKeepsPaint('saved', 'recent')).toBe(false);
  });
});

describe('speculative bootstrap wiring', () => {
  it('requests before the wallet resolves and adopts like the SSR seed', () => {
    const homeSrc = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(homeSrc, 'home-feed.tsx'), 'utf8');

    expect(source).toContain('fetchHomeFeedPageClient');
    expect(source).toContain('shouldRequestSpeculativeFeedPage');
    expect(source).toContain('shouldAdoptSpeculativeFeedPage');
    expect(source).toContain('speculativeFeedKeepsPaint');
    expect(source).toContain('speculativePage');
  });
});
