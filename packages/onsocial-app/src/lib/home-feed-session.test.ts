import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import {
  clearHomeFeedSession,
  HOME_FEED_COLD_PROBE_DELAY_MS,
  HOME_FEED_SESSION_PROBE_DELAY_MS,
  HOME_FEED_SESSION_TTL_MS,
  HOME_FEED_SSR_SESSION_KEY,
  homeFeedSessionKey,
  homeFeedSessionProbeDelayMs,
  peekHomeFeedSession,
  readHomeFeedSession,
  writeHomeFeedSession,
} from './home-feed-session';

function row(accountId: string, postId: string): PostRow {
  return {
    accountId,
    postId,
    value: '{"text":"hi"}',
    blockHeight: 1,
    blockTimestamp: 1,
    groupId: 'dao',
  };
}

afterEach(() => {
  clearHomeFeedSession();
});

describe('homeFeedSessionKey', () => {
  it('matches the SSR hot global seed', () => {
    expect(
      homeFeedSessionKey({
        lens: 'global',
        sort: 'hot',
        focusKey: null,
        accountId: 'alice.near',
      })
    ).toBe(HOME_FEED_SSR_SESSION_KEY);
  });

  it('scopes pulse and saved to the viewer', () => {
    expect(
      homeFeedSessionKey({
        lens: 'pulse',
        sort: 'hot',
        focusKey: null,
        accountId: 'alice.near',
      })
    ).toBe('pulse|hot||alice.near');
    expect(
      homeFeedSessionKey({
        lens: 'saved',
        sort: 'recent',
        focusKey: 'tag:os',
        accountId: 'alice.near',
      })
    ).toBe('saved|recent|tag:os|alice.near');
  });
});

describe('home feed session snapshot', () => {
  it('round-trips posts, offset, and scroll in memory', () => {
    const posts = [row('a.near', '1'), row('b.near', '2')];
    writeHomeFeedSession({
      sessionKey: HOME_FEED_SSR_SESSION_KEY,
      posts,
      nextOffset: 48,
      standingNetworkIds: ['alice.near'],
      offsetShiftApplied: 2,
      scrollTop: 640,
    });

    const snapped = peekHomeFeedSession();
    expect(snapped?.posts).toEqual(posts);
    expect(snapped?.posts).not.toBe(posts);
    expect(snapped?.nextOffset).toBe(48);
    expect(snapped?.standingNetworkIds).toEqual(['alice.near']);
    expect(snapped?.offsetShiftApplied).toBe(2);
    expect(snapped?.scrollTop).toBe(640);

    expect(readHomeFeedSession(HOME_FEED_SSR_SESSION_KEY)?.scrollTop).toBe(640);
    expect(readHomeFeedSession('pulse|hot||alice.near')).toBeNull();
  });

  it('does not store an empty list', () => {
    writeHomeFeedSession({
      sessionKey: HOME_FEED_SSR_SESSION_KEY,
      posts: [],
      nextOffset: undefined,
      standingNetworkIds: null,
      offsetShiftApplied: 0,
      scrollTop: 12,
    });
    expect(peekHomeFeedSession()).toBeNull();
  });

  it('expires after the session TTL', () => {
    writeHomeFeedSession({
      sessionKey: HOME_FEED_SSR_SESSION_KEY,
      posts: [row('a.near', '1')],
      nextOffset: 24,
      standingNetworkIds: null,
      offsetShiftApplied: 0,
      scrollTop: 80,
      now: 1_000,
    });
    expect(
      peekHomeFeedSession(1_000 + HOME_FEED_SESSION_TTL_MS + 1)
    ).toBeNull();
  });

  it('probes immediately after restore and waits on a cold visit', () => {
    expect(homeFeedSessionProbeDelayMs(true)).toBe(
      HOME_FEED_SESSION_PROBE_DELAY_MS
    );
    expect(homeFeedSessionProbeDelayMs(false)).toBe(
      HOME_FEED_COLD_PROBE_DELAY_MS
    );
  });
});

describe('home feed session wiring', () => {
  it('restores from memory on remount and does not persist to storage', () => {
    const libDir = dirname(fileURLToPath(import.meta.url));
    const pageSrc = readFileSync(
      join(libDir, '../features/home/home-feed.tsx'),
      'utf8'
    );
    const routeSrc = readFileSync(
      join(libDir, '../app/(app)/home/page.tsx'),
      'utf8'
    );
    expect(pageSrc).toContain('peekHomeFeedSession');
    expect(pageSrc).toContain('writeHomeFeedSession');
    expect(pageSrc).toContain('homeFeedSessionProbeDelayMs');
    expect(pageSrc).not.toContain('localStorage');
    expect(pageSrc).not.toContain('sessionStorage.setItem');
    expect(routeSrc).toContain('fallback={<HomePagePanel />}');
    expect(routeSrc).toContain('HomeFeedPaintedPage');
  });
});
