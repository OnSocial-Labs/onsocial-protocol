import { describe, expect, it } from 'vitest';
import {
  overlayScrollThumbIsVisible,
  overlayThumbDragScroll,
  resolveOverlayScrollThumb,
  resolveOverlayScrollThumbRight,
  scrollThumbCoveredByOverlay,
  scrollThumbYieldsToInner,
} from './os-overlay-scroll-thumb.js';

describe('resolveOverlayScrollThumb', () => {
  it('stays hidden when the drawer fits', () => {
    expect(resolveOverlayScrollThumb(0, 400, 400, 80)).toBeNull();
    expect(resolveOverlayScrollThumb(0, 401, 400, 80)).toBeNull();
  });

  it('paints over the body without using a layout rail', () => {
    const thumb = resolveOverlayScrollThumb(0, 800, 400, 96);
    expect(thumb).not.toBeNull();
    expect(thumb!.top).toBe(96);
    expect(thumb!.height).toBe(200);
  });

  it('travels with the scroll and stays inside the body', () => {
    const thumb = resolveOverlayScrollThumb(400, 800, 400, 96);
    expect(thumb).toEqual({ top: 296, height: 200 });
  });

  it('drags the thumb in proportion to the hidden overflow', () => {
    expect(overlayThumbDragScroll(0, 50, 200, 400)).toBe(100);
    expect(overlayThumbDragScroll(100, -50, 200, 400)).toBe(0);
    expect(overlayThumbDragScroll(300, 80, 200, 400)).toBe(400);
  });
  it('pins the thumb inside the scroller’s right edge', () => {
    expect(resolveOverlayScrollThumbRight(1920, 1247)).toBe(675);
    expect(resolveOverlayScrollThumbRight(0, 1247)).toBe(2);
  });

  it('hides the page thumb while a drawer covers it', () => {
    expect(scrollThumbCoveredByOverlay(true, false)).toBe(true);
    expect(scrollThumbCoveredByOverlay(true, true)).toBe(false);
    expect(scrollThumbCoveredByOverlay(false, false)).toBe(false);
  });

  it('hides the outer bar when an inner list is the scroller', () => {
    expect(scrollThumbYieldsToInner(true)).toBe(true);
    expect(scrollThumbYieldsToInner(false)).toBe(false);
  });

  it('hides a thumb for a pager page that sits off screen', () => {
    expect(overlayScrollThumbIsVisible(673, 80, 1247, 1079, 1920, 1080)).toBe(
      true
    );
    expect(
      overlayScrollThumbIsVisible(1821, 80, 2395, 1079, 1920, 1080)
    ).toBe(false);
  });
});
