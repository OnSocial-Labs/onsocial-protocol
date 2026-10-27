import { describe, expect, it, vi } from 'vitest';
import {
  containFitRect,
  rectFromRectLike,
  zoomOriginFromTile,
  zoomRectsEqual,
} from '@/features/home/feed-photo-zoom';

describe('containFitRect', () => {
  it('letterboxes a wide image into a tall box', () => {
    const fit = containFitRect(
      { left: 10, top: 20, width: 400, height: 800 },
      2
    );
    expect(fit.width).toBe(400);
    expect(fit.height).toBe(200);
    expect(fit.left).toBe(10);
    expect(fit.top).toBe(320);
  });

  it('pillarboxes a tall image into a wide box', () => {
    const fit = containFitRect(
      { left: 0, top: 0, width: 800, height: 400 },
      0.5
    );
    expect(fit.width).toBe(200);
    expect(fit.height).toBe(400);
    expect(fit.left).toBe(300);
    expect(fit.top).toBe(0);
  });

  it('fills the box when aspects match', () => {
    const fit = containFitRect(
      { left: 5, top: 6, width: 300, height: 300 },
      1
    );
    expect(fit).toEqual({ left: 5, top: 6, width: 300, height: 300 });
  });

  it('passes the box through for degenerate input', () => {
    const box = { left: 1, top: 2, width: 10, height: 20 };
    expect(containFitRect(box, 0)).toEqual(box);
    expect(containFitRect(box, Number.NaN)).toEqual(box);
    expect(containFitRect({ ...box, width: 0 }, 1)).toEqual({
      ...box,
      width: 0,
    });
  });
});

describe('zoomRectsEqual', () => {
  it('treats sub-pixel deltas as equal', () => {
    const a = { left: 10, top: 10, width: 100, height: 50 };
    const b = { left: 10.4, top: 9.6, width: 100.2, height: 49.8 };
    expect(zoomRectsEqual(a, b)).toBe(true);
    expect(zoomRectsEqual(a, { ...b, top: 12 })).toBe(false);
  });
});

function fakeImg(overrides: Record<string, unknown> = {}) {
  return {
    tagName: 'IMG',
    complete: true,
    naturalWidth: 1200,
    naturalHeight: 800,
    currentSrc: 'https://cdn.example/pic-640.webp',
    src: 'https://cdn.example/pic.webp',
    getBoundingClientRect: () => ({
      left: 24,
      top: 100,
      width: 276,
      height: 184,
    }),
    ...overrides,
  };
}

function fakeTile(media: unknown) {
  return {
    querySelector: (selector: string) =>
      selector === '.post-media-element' ? media : null,
  } as unknown as HTMLElement;
}

describe('zoomOriginFromTile', () => {
  it('captures rect, resolved src, aspect, and radius from the tile img', () => {
    vi.stubGlobal(
      'getComputedStyle',
      () => ({ borderRadius: '12px' }) as CSSStyleDeclaration
    );
    const img = fakeImg();
    const origin = zoomOriginFromTile(fakeTile(img), 3);
    expect(origin).not.toBeNull();
    expect(origin!.mediaIndex).toBe(3);
    expect(origin!.rect).toEqual({ left: 24, top: 100, width: 276, height: 184 });
    expect(origin!.src).toBe('https://cdn.example/pic-640.webp');
    expect(origin!.aspect).toBe(1.5);
    expect(origin!.radius).toBe('12px');
    expect(origin!.element).toBe(img);
    vi.unstubAllGlobals();
  });

  it('bails without a tile or on a negative index', () => {
    expect(zoomOriginFromTile(null, 0)).toBeNull();
    expect(zoomOriginFromTile(fakeTile(fakeImg()), -1)).toBeNull();
  });

  it('bails when the media is not a still image (video tile)', () => {
    const video = { tagName: 'VIDEO' };
    expect(zoomOriginFromTile(fakeTile(video), 0)).toBeNull();
  });

  it('bails while the thumbnail is still loading', () => {
    expect(
      zoomOriginFromTile(fakeTile(fakeImg({ complete: false })), 0)
    ).toBeNull();
    expect(
      zoomOriginFromTile(fakeTile(fakeImg({ naturalWidth: 0 })), 0)
    ).toBeNull();
  });

  it('bails on a collapsed or empty thumbnail', () => {
    const collapsed = fakeImg({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
    });
    expect(zoomOriginFromTile(fakeTile(collapsed), 0)).toBeNull();
    expect(
      zoomOriginFromTile(fakeTile(fakeImg({ currentSrc: '', src: '' })), 0)
    ).toBeNull();
  });

  it('falls back to img.src and a zero radius without getComputedStyle', () => {
    vi.stubGlobal('getComputedStyle', undefined);
    const origin = zoomOriginFromTile(
      fakeTile(fakeImg({ currentSrc: '' })),
      1
    );
    expect(origin!.src).toBe('https://cdn.example/pic.webp');
    expect(origin!.radius).toBe('0px');
    vi.unstubAllGlobals();
  });
});

describe('rectFromRectLike', () => {
  it('copies the four box fields', () => {
    expect(rectFromRectLike({ left: 1, top: 2, width: 3, height: 4 })).toEqual(
      { left: 1, top: 2, width: 3, height: 4 }
    );
  });
});
