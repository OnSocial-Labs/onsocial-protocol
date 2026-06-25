import { describe, expect, it } from 'vitest';
import { resolvePageFace, resolvePageHeroSource } from './page-face';

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

  it('can force banner hero in cover layout', () => {
    expect(
      resolvePageFace({
        config: { face: { heroSource: 'banner' } },
        avatarMode: 'cover',
        avatarMedia: { kind: 'image', url: 'https://cdn.example/avatar.jpg' },
        bannerMedia: { kind: 'video', url: 'https://cdn.example/reel.mp4' },
      }).hero
    ).toEqual({ kind: 'video', url: 'https://cdn.example/reel.mp4' });
  });
});
