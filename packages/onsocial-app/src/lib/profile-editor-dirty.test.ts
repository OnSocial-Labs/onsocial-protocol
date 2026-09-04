import { describe, expect, it } from 'vitest';
import type { ProfileEditorSnapshot } from '@/hooks/use-app-profile-editor';
import { isProfileEditorDirty } from '@/lib/profile-editor-dirty';
import { sanitizeLinkNotes } from '@/lib/page-launch-config';
import { profileLinksInputFromRecord } from '@/lib/profile-links';

function baseSnapshot(
  overrides: Partial<ProfileEditorSnapshot> = {}
): ProfileEditorSnapshot {
  return {
    accountId: 'alice.testnet',
    hasProfile: true,
    name: 'Alice',
    location: 'Lisbon',
    industry: '',
    kind: null,
    bio: 'Builder',
    about: '',
    lead: '',
    aboutAlign: 'left',
    avatarUrl: 'https://cdn.example/avatar.png',
    bannerUrl: 'https://cdn.example/banner.png',
    bannerMedia: { kind: 'image', url: 'https://cdn.example/banner.png' },
    links: {},
    pageConfig: {},
    tags: [],
    photos: [],
    ...overrides,
  };
}

function dirtyInput(
  snapshot: ProfileEditorSnapshot,
  overrides: Partial<Parameters<typeof isProfileEditorDirty>[0]> = {}
): Parameters<typeof isProfileEditorDirty>[0] {
  const linksFromSnapshot = profileLinksInputFromRecord(snapshot.links);
  return {
    snapshot,
    linksFromSnapshot,
    name: snapshot.name,
    location: snapshot.location,
    industry: snapshot.industry,
    kind: snapshot.kind === 'org' ? 'org' : 'person',
    bio: snapshot.bio,
    about: snapshot.about,
    lead: snapshot.lead,
    aboutAlign: snapshot.aboutAlign,
    links: linksFromSnapshot,
    tags: snapshot.tags,
    photos: snapshot.photos,
    photoFiles: [],
    linkNotes: sanitizeLinkNotes(snapshot.pageConfig.linkNotes),
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

  it('is dirty when bio changes', () => {
    const snapshot = baseSnapshot();
    expect(
      isProfileEditorDirty(dirtyInput(snapshot, { bio: 'Building #near' }))
    ).toBe(true);
  });

  it('is dirty when About continuation changes', () => {
    const snapshot = baseSnapshot();
    expect(
      isProfileEditorDirty(dirtyInput(snapshot, { about: 'More on About.' }))
    ).toBe(true);
  });

  it('is dirty when location changes', () => {
    const snapshot = baseSnapshot();
    expect(
      isProfileEditorDirty(dirtyInput(snapshot, { location: 'Tokyo' }))
    ).toBe(true);
  });

  it('is dirty when kind changes from omitted person to org', () => {
    const snapshot = baseSnapshot();
    expect(isProfileEditorDirty(dirtyInput(snapshot, { kind: 'org' }))).toBe(
      true
    );
  });

  it('is clean when kind stays person and snapshot omitted kind', () => {
    const snapshot = baseSnapshot({ kind: null });
    expect(isProfileEditorDirty(dirtyInput(snapshot, { kind: 'person' }))).toBe(
      false
    );
  });

  it('is dirty when org industry changes', () => {
    const snapshot = baseSnapshot({ kind: 'org', industry: 'Music' });
    expect(
      isProfileEditorDirty(
        dirtyInput(snapshot, { kind: 'org', industry: 'Film' })
      )
    ).toBe(true);
  });

  it('is dirty when identity topics change', () => {
    const snapshot = baseSnapshot({ tags: ['design'] });
    expect(
      isProfileEditorDirty(dirtyInput(snapshot, { tags: ['writing'] }))
    ).toBe(true);
  });

  it('is dirty when About photos change', () => {
    const snapshot = baseSnapshot({
      photos: [{ ref: 'ipfs://one', url: 'https://cdn.example/one.jpg' }],
    });
    expect(
      isProfileEditorDirty(
        dirtyInput(snapshot, {
          photos: [{ ref: 'ipfs://two', url: 'https://cdn.example/two.jpg' }],
        })
      )
    ).toBe(true);
  });

  it('is dirty when About photos are reordered', () => {
    const snapshot = baseSnapshot({
      photos: [
        { ref: 'ipfs://one', url: 'https://cdn.example/one.jpg' },
        { ref: 'ipfs://two', url: 'https://cdn.example/two.jpg' },
      ],
    });
    expect(
      isProfileEditorDirty(
        dirtyInput(snapshot, {
          photos: [
            { ref: 'ipfs://two', url: 'https://cdn.example/two.jpg' },
            { ref: 'ipfs://one', url: 'https://cdn.example/one.jpg' },
          ],
        })
      )
    ).toBe(true);
  });

  it('is dirty when a link title changes', () => {
    const snapshot = baseSnapshot({
      pageConfig: { linkNotes: { website: 'Home' } },
    });
    expect(
      isProfileEditorDirty(
        dirtyInput(snapshot, {
          linkNotes: { website: 'My website' },
        })
      )
    ).toBe(true);
  });
});
