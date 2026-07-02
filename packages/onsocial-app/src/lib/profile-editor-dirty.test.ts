import { describe, expect, it } from 'vitest';
import type { ProfileEditorSnapshot } from '@/hooks/use-app-profile-editor';
import { isProfileEditorDirty } from '@/lib/profile-editor-dirty';
import { profileLinksInputFromRecord } from '@/lib/profile-links';

function baseSnapshot(
  overrides: Partial<ProfileEditorSnapshot> = {}
): ProfileEditorSnapshot {
  return {
    accountId: 'alice.testnet',
    hasProfile: true,
    name: 'Alice',
    bio: 'Builder',
    avatarUrl: 'https://cdn.example/avatar.png',
    bannerUrl: 'https://cdn.example/banner.png',
    links: {},
    tags: [],
    ...overrides,
  };
}

function dirtyInput(
  snapshot: ProfileEditorSnapshot,
  overrides: Partial<Parameters<typeof isProfileEditorDirty>[0]> = {}
) {
  const linksFromSnapshot = profileLinksInputFromRecord(snapshot.links);
  return {
    snapshot,
    linksFromSnapshot,
    tagsFromSnapshot: snapshot.tags,
    name: snapshot.name,
    bio: snapshot.bio,
    links: linksFromSnapshot,
    tags: snapshot.tags,
    avatarFile: null,
    bannerFile: null,
    avatarRemoved: false,
    bannerRemoved: false,
    ...overrides,
  };
}

describe('isProfileEditorDirty', () => {
  it('is clean when nothing changed', () => {
    const snapshot = baseSnapshot();
    expect(isProfileEditorDirty(dirtyInput(snapshot))).toBe(false);
  });

  it('is dirty when avatar removal is staged', () => {
    const snapshot = baseSnapshot();
    expect(
      isProfileEditorDirty(
        dirtyInput(snapshot, {
          avatarRemoved: true,
        })
      )
    ).toBe(true);
  });

  it('is dirty when banner removal is staged', () => {
    const snapshot = baseSnapshot();
    expect(
      isProfileEditorDirty(
        dirtyInput(snapshot, {
          bannerRemoved: true,
        })
      )
    ).toBe(true);
  });

  it('ignores avatar removal when no avatar is saved', () => {
    const snapshot = baseSnapshot({ avatarUrl: null });
    expect(
      isProfileEditorDirty(
        dirtyInput(snapshot, {
          avatarRemoved: true,
        })
      )
    ).toBe(false);
  });

  it('ignores banner removal when no banner is saved', () => {
    const snapshot = baseSnapshot({ bannerUrl: null });
    expect(
      isProfileEditorDirty(
        dirtyInput(snapshot, {
          bannerRemoved: true,
        })
      )
    ).toBe(false);
  });
});
