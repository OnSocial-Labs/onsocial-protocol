import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import {
  clearHomeFeedSession,
  HOME_FEED_COLD_PROBE_DELAY_MS,
  HOME_FEED_SESSION_HINT_COOKIE,
  HOME_FEED_SESSION_PROBE_DELAY_MS,
  HOME_FEED_SESSION_TTL_MS,
  HOME_FEED_SSR_SESSION_KEY,
  homeFeedSessionKey,
  homeFeedSessionProbeDelayMs,
  noteHomeFeedSessionScroll,
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

  it('round-trips the stand epoch when present, absent otherwise', () => {
    writeHomeFeedSession({
      sessionKey: HOME_FEED_SSR_SESSION_KEY,
      posts: [row('a.near', '1')],
      nextOffset: 24,
      standingNetworkIds: ['alice.near'],
      offsetShiftApplied: 0,
      scrollTop: 0,
      standEpoch: 3,
    });
    expect(peekHomeFeedSession()?.standEpoch).toBe(3);

    writeHomeFeedSession({
      sessionKey: HOME_FEED_SSR_SESSION_KEY,
      posts: [row('a.near', '1')],
      nextOffset: 24,
      standingNetworkIds: ['alice.near'],
      offsetShiftApplied: 0,
      scrollTop: 0,
    });
    expect(peekHomeFeedSession()?.standEpoch).toBeUndefined();
  });

  it('round-trips block heights and drops junk entries', () => {
    writeHomeFeedSession({
      sessionKey: HOME_FEED_SSR_SESSION_KEY,
      posts: [row('a.near', '1')],
      nextOffset: 24,
      standingNetworkIds: null,
      offsetShiftApplied: 0,
      scrollTop: 0,
      blockHeights: {
        'a.near:1': 412.6,
        'b.near:2': 0,
        'c.near:3': Number.NaN,
      },
    });
    expect(peekHomeFeedSession()?.blockHeights).toEqual({ 'a.near:1': 412.6 });

    writeHomeFeedSession({
      sessionKey: HOME_FEED_SSR_SESSION_KEY,
      posts: [row('a.near', '1')],
      nextOffset: 24,
      standingNetworkIds: null,
      offsetShiftApplied: 0,
      scrollTop: 0,
    });
    expect(peekHomeFeedSession()?.blockHeights).toBeUndefined();
  });

  it('keeps a memory copy without touching tab storage', () => {
    writeHomeFeedSession({
      sessionKey: HOME_FEED_SSR_SESSION_KEY,
      posts: [row('a.near', '1')],
      nextOffset: 24,
      standingNetworkIds: null,
      offsetShiftApplied: 0,
      scrollTop: 80,
      storage: false,
    });
    expect(
      peekHomeFeedSession(undefined, { hydrateStorage: false })?.scrollTop
    ).toBe(80);
    noteHomeFeedSessionScroll(140);
    expect(
      peekHomeFeedSession(undefined, { hydrateStorage: false })?.scrollTop
    ).toBe(140);
  });

  it('marks a saved list for the server and clears the mark with the session', () => {
    const writes: string[] = [];
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        get cookie() {
          return writes.at(-1) ?? '';
        },
        set cookie(value: string) {
          writes.push(value);
        },
      },
    });
    try {
      writeHomeFeedSession({
        sessionKey: HOME_FEED_SSR_SESSION_KEY,
        posts: [row('a.near', '1')],
        nextOffset: 24,
        standingNetworkIds: null,
        offsetShiftApplied: 0,
        scrollTop: 10,
        storage: false,
      });
      expect(writes.at(-1)).toContain(`${HOME_FEED_SESSION_HINT_COOKIE}=1`);
      expect(writes.at(-1)).toContain('Max-Age=1800');
      clearHomeFeedSession();
      expect(writes.at(-1)).toContain(`${HOME_FEED_SESSION_HINT_COOKIE}=`);
      expect(writes.at(-1)).toContain('Max-Age=0');
    } finally {
      delete (globalThis as { document?: unknown }).document;
      clearHomeFeedSession();
    }
  });
});

describe('home feed session storage mirror', () => {
  function stubSessionStorage(): Map<string, string> {
    const map = new Map<string, string>();
    const storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, String(value));
      },
      removeItem: (key: string) => {
        map.delete(key);
      },
    };
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: storage,
      configurable: true,
      writable: true,
    });
    return map;
  }

  afterEach(() => {
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  });

  it('paints the same list after a reload in the same tab', async () => {
    stubSessionStorage();
    writeHomeFeedSession({
      sessionKey: HOME_FEED_SSR_SESSION_KEY,
      posts: [row('a.near', '1'), row('b.near', '2')],
      nextOffset: 48,
      standingNetworkIds: ['alice.near'],
      offsetShiftApplied: 2,
      scrollTop: 640,
      now: 1_000,
    });

    // A reload re-evaluates the module — only storage survives.
    vi.resetModules();
    const fresh = await import('./home-feed-session');
    const restored = fresh.peekHomeFeedSession(2_000);
    expect(restored?.posts.map((post) => post.postId)).toEqual(['1', '2']);
    expect(restored?.nextOffset).toBe(48);
    expect(restored?.standingNetworkIds).toEqual(['alice.near']);
    expect(restored?.offsetShiftApplied).toBe(2);
    expect(restored?.scrollTop).toBe(640);
  });

  it('keeps the stand epoch across a reload', async () => {
    stubSessionStorage();
    writeHomeFeedSession({
      sessionKey: HOME_FEED_SSR_SESSION_KEY,
      posts: [row('a.near', '1')],
      nextOffset: 24,
      standingNetworkIds: ['alice.near'],
      offsetShiftApplied: 0,
      scrollTop: 0,
      standEpoch: 2,
      now: 1_000,
    });
    vi.resetModules();
    const fresh = await import('./home-feed-session');
    expect(fresh.peekHomeFeedSession(2_000)?.standEpoch).toBe(2);
  });

  it('drops an expired copy from storage too', async () => {
    const map = stubSessionStorage();
    writeHomeFeedSession({
      sessionKey: HOME_FEED_SSR_SESSION_KEY,
      posts: [row('a.near', '1')],
      nextOffset: 24,
      standingNetworkIds: null,
      offsetShiftApplied: 0,
      scrollTop: 0,
      now: 1_000,
    });
    vi.resetModules();
    const fresh = await import('./home-feed-session');
    expect(
      fresh.peekHomeFeedSession(1_000 + HOME_FEED_SESSION_TTL_MS + 1)
    ).toBeNull();
    expect(map.size).toBe(0);
  });

  it('ignores a corrupt or foreign copy', async () => {
    const map = stubSessionStorage();
    map.set('onsocial.home-feed-session', '{not json');
    vi.resetModules();
    let fresh = await import('./home-feed-session');
    expect(fresh.peekHomeFeedSession()).toBeNull();

    map.set(
      'onsocial.home-feed-session',
      JSON.stringify({
        v: 999,
        snapshot: { sessionKey: 'x', posts: [{}], savedAt: 1 },
      })
    );
    vi.resetModules();
    fresh = await import('./home-feed-session');
    expect(fresh.peekHomeFeedSession()).toBeNull();
  });

  it('keeps the memory copy when storage is denied', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
        removeItem: () => undefined,
      },
      configurable: true,
      writable: true,
    });
    writeHomeFeedSession({
      sessionKey: HOME_FEED_SSR_SESSION_KEY,
      posts: [row('a.near', '1')],
      nextOffset: 24,
      standingNetworkIds: null,
      offsetShiftApplied: 0,
      scrollTop: 12,
    });
    expect(peekHomeFeedSession()?.scrollTop).toBe(12);
  });

  it('caps the persisted list so longform bodies fit the quota', () => {
    const map = stubSessionStorage();
    const posts = Array.from({ length: 80 }, (_, index) =>
      row('a.near', String(index))
    );
    writeHomeFeedSession({
      sessionKey: HOME_FEED_SSR_SESSION_KEY,
      posts,
      nextOffset: 160,
      standingNetworkIds: null,
      offsetShiftApplied: 0,
      scrollTop: 0,
    });
    // Memory keeps every row — only the stored copy is capped.
    expect(peekHomeFeedSession()?.posts).toHaveLength(80);
    const raw = map.get('onsocial.home-feed-session');
    const parsed = JSON.parse(raw ?? '{}') as {
      snapshot: { posts: PostRow[] };
    };
    expect(parsed.snapshot.posts).toHaveLength(60);
    expect(parsed.snapshot.posts.at(-1)?.postId).toBe('59');
  });
});

describe('home feed session wiring', () => {
  it('restores on remount and persists to tab storage, never localStorage', () => {
    const libDir = dirname(fileURLToPath(import.meta.url));
    const pageSrc = readFileSync(
      join(libDir, '../features/home/home-feed.tsx'),
      'utf8'
    );
    const sessionSrc = readFileSync(
      join(libDir, 'home-feed-session.ts'),
      'utf8'
    );
    const hostSrc = readFileSync(
      join(libDir, '../components/providers/feed-session-host.tsx'),
      'utf8'
    );
    expect(pageSrc).toContain('peekHomeFeedSession');
    expect(pageSrc).toContain('restoredSession?.posts ?? initialPage?.items');
    expect(pageSrc).toContain('writeHomeFeedSession');
    expect(pageSrc).toContain('homeFeedSessionProbeDelayMs');
    expect(pageSrc).toContain('pagehide');
    expect(sessionSrc).toContain('sessionStorage');
    expect(sessionSrc).not.toContain('localStorage');
    expect(pageSrc).not.toContain('localStorage');
    expect(hostSrc).toContain('<HomePagePanel />');
    expect(hostSrc).toContain('onFeed ? page');
    expect(hostSrc).not.toContain('loadHomeFeedPage');
    const routeSrc = readFileSync(
      join(libDir, '../features/home/home-feed-route.tsx'),
      'utf8'
    );
    expect(routeSrc).toContain('HomePagePanel');
    expect(routeSrc).toContain('initialPage={paint?.page ?? null}');
  });

  it('invalidates standing sources when a stand confirms after the snapshot', () => {
    const libDir = dirname(fileURLToPath(import.meta.url));
    const pageSrc = readFileSync(
      join(libDir, '../features/home/home-feed.tsx'),
      'utf8'
    );
    const standingSrc = readFileSync(
      join(libDir, '../hooks/use-viewer-standing.ts'),
      'utf8'
    );

    // Snapshot records the epoch; restore adoption rejects a stale one.
    expect(pageSrc).toContain('standEpoch: getViewerStandEpoch()');
    expect(pageSrc).toContain('restoredStandStale');
    // Live stands soft-reload a mounted social lens.
    expect(pageSrc).toContain('subscribeViewerStandConfirmed');
    // The single stand funnel emits the event on confirm.
    expect(standingSrc).toContain('recordViewerStandConfirmed()');
  });
});
