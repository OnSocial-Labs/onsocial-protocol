import { describe, expect, it } from 'vitest';
import {
  readPageHeroSourceExplicit,
  resolvePageFace,
  resolvePageHeroSource,
} from './page-face';

describe('readPageHeroSourceExplicit', () => {
  it('defaults to banner when heroSource is not set', () => {
    expect(readPageHeroSourceExplicit({})).toBe('banner');
    expect(readPageHeroSourceExplicit({ face: {} })).toBe('banner');
  });

  it('returns explicit heroSource when set', () => {
    expect(
      readPageHeroSourceExplicit({ face: { heroSource: 'none' } })
    ).toBe('none');
  });
});

describe('resolvePageHeroSource', () => {
  it('defaults to banner for standard layout', () => {
    expect(resolvePageHeroSource({}, 'standard')).toBe('banner');
  });

  it('defaults to avatar for cover layout', () => {
    expect(resolvePageHeroSource({}, 'cover')).toBe('avatar');
  });

  it('honours explicit heroSource', () => {
    expect(
      resolvePageHeroSource({ face: { heroSource: 'none' } }, 'cover')
    ).toBe('none');
  });
});

describe('resolvePageFace', () => {
  it('uses banner media in standard layout', () => {
    expect(
      resolvePageFace({
        config: {},
        avatarMode: 'standard',
        avatarMedia: { kind: 'image', url: 'https://cdn.example/avatar.jpg' },
        bannerMedia: { kind: 'video', url: 'https://cdn.example/reel.mp4' },
      })
    ).toEqual({
      hero: { kind: 'video', url: 'https://cdn.example/reel.mp4' },
      heroSource: 'banner',
      isCoverLayout: false,
    });
  });

  it('uses avatar media in cover layout', () => {
    expect(
      resolvePageFace({
        config: {},
        avatarMode: 'cover',
        avatarMedia: { kind: 'image', url: 'https://cdn.example/avatar.jpg' },
        bannerMedia: { kind: 'video', url: 'https://cdn.example/reel.mp4' },
      })
    ).toEqual({
      hero: { kind: 'image', url: 'https://cdn.example/avatar.jpg' },
      heroSource: 'avatar',
      isCoverLayout: true,
    });
  });

  it('uses avatar media in cover layout even when heroSource is banner', () => {
    expect(
      resolvePageFace({
        config: { face: { heroSource: 'banner' } },
        avatarMode: 'cover',
        avatarMedia: { kind: 'image', url: 'https://cdn.example/avatar.jpg' },
        bannerMedia: { kind: 'video', url: 'https://cdn.example/reel.mp4' },
      })
    ).toEqual({
      hero: { kind: 'image', url: 'https://cdn.example/avatar.jpg' },
      heroSource: 'avatar',
      isCoverLayout: true,
    });
  });
});
