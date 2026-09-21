import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { DiscoverProfileSummary } from '@/lib/discover-profiles';
import {
  clearDiscoverListSession,
  DISCOVER_LIST_SESSION_TTL_MS,
  discoverListSessionKey,
  peekDiscoverListSession,
  readDiscoverListSession,
  writeDiscoverListSession,
} from './discover-list-session';

function row(accountId: string): DiscoverProfileSummary {
  return {
    accountId,
    name: accountId,
    bio: null,
    avatarUrl: null,
    standingCount: 0,
    standingWithCount: 0,
    mutualStandingCount: 0,
    endorsementsReceivedCount: 0,
    endorsementsGivenCount: 0,
    moodId: 'protocol',
    viewerStanding: false,
    theyStandWithViewer: false,
    targetEndorsedViewer: false,
    viewerEndorsed: false,
  };
}

afterEach(() => {
  clearDiscoverListSession();
});

describe('discoverListSessionKey', () => {
  it('scopes the place by query and filters, not the tab', () => {
    expect(
      discoverListSessionKey({
        query: '',
        face: 'all',
        industry: '',
        craft: '',
      })
    ).toBe('__all__|all|__any__|__any__');
    expect(
      discoverListSessionKey({
        query: '  os  ',
        face: 'hiring',
        industry: 'Healthcare',
        craft: 'design',
      })
    ).toBe('os|hiring|Healthcare|design');
  });
});

describe('discover list session snapshot', () => {
  it('round-trips profiles, hasMore, and tab scroll in memory', () => {
    const profiles = [row('a.near'), row('b.near')];
    const tabScroll = { profiles: 640, daos: 120 };
    writeDiscoverListSession({
      sessionKey: '__all__|all|__any__|__any__',
      tab: 'profiles',
      profiles,
      hasMore: true,
      tabScroll,
    });

    const snapped = peekDiscoverListSession();
    expect(snapped?.profiles).toEqual(profiles);
    expect(snapped?.profiles).not.toBe(profiles);
    expect(snapped?.hasMore).toBe(true);
    expect(snapped?.tabScroll).toEqual(tabScroll);
    expect(snapped?.tabScroll).not.toBe(tabScroll);
    expect(
      readDiscoverListSession('__all__|all|__any__|__any__')?.tabScroll.profiles
    ).toBe(640);
    expect(readDiscoverListSession('os|all|__any__|__any__')).toBeNull();
  });

  it('stores scroll-only snapshots so a non-profiles tab can resume', () => {
    writeDiscoverListSession({
      sessionKey: '__all__|all|__any__|__any__',
      tab: 'trending',
      profiles: [],
      hasMore: false,
      tabScroll: { trending: 480 },
    });
    expect(peekDiscoverListSession()?.tabScroll.trending).toBe(480);
  });

  it('does not store an empty list with no scroll', () => {
    writeDiscoverListSession({
      sessionKey: '__all__|all|__any__|__any__',
      tab: 'profiles',
      profiles: [],
      hasMore: false,
      tabScroll: {},
    });
    expect(peekDiscoverListSession()).toBeNull();
  });

  it('expires after the session TTL', () => {
    writeDiscoverListSession({
      sessionKey: '__all__|all|__any__|__any__',
      tab: 'profiles',
      profiles: [row('a.near')],
      hasMore: false,
      tabScroll: { profiles: 80 },
      now: 1_000,
    });
    expect(
      peekDiscoverListSession(1_000 + DISCOVER_LIST_SESSION_TTL_MS + 1)
    ).toBeNull();
  });
});

describe('discover list session wiring', () => {
  it('restores from memory on remount without a second server paint', () => {
    const libDir = dirname(fileURLToPath(import.meta.url));
    const hookSrc = readFileSync(
      join(libDir, '../hooks/use-discover-profiles.ts'),
      'utf8'
    );
    const routeSrc = readFileSync(
      join(libDir, '../app/(app)/discover/page.tsx'),
      'utf8'
    );
    expect(hookSrc).toContain('readDiscoverListSession');
    expect(hookSrc).toContain('writeDiscoverListSession');
    expect(hookSrc).toContain('skipFilterScrollResetRef');
    expect(hookSrc).not.toContain('localStorage');
    expect(hookSrc).not.toContain('sessionStorage.setItem');
    expect(routeSrc).toContain('DiscoverPagePanel');
    expect(routeSrc).not.toContain('fallback={<DiscoverClient />}');
    expect(routeSrc).not.toContain("dynamic = 'force-dynamic'");
  });
});
