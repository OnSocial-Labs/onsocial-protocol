import { describe, expect, it } from 'vitest';
import {
  dockRisePx,
  isScrolledToEnd,
  nextScrollerTop,
} from '@/lib/write-dock-keyboard-hold';

describe('write dock keyboard hold', () => {
  it('treats a subpixel dock move as still', () => {
    expect(dockRisePx(400, 400.2)).toBe(0);
    expect(dockRisePx(400, 320)).toBe(80);
    expect(dockRisePx(320, 400)).toBe(-80);
  });

  it('shifts the feed by the launcher rise and clamps at the ends', () => {
    expect(nextScrollerTop(100, 800, 400, 80)).toBe(180);
    expect(nextScrollerTop(20, 800, 400, -80)).toBe(0);
    expect(nextScrollerTop(390, 800, 400, 80)).toBe(400);
    expect(nextScrollerTop(100, 800, 400, 0.2)).toBe(100);
  });

  it('pins a thread that is already on the latest line', () => {
    expect(isScrolledToEnd(320, 800, 400)).toBe(true);
    expect(isScrolledToEnd(200, 800, 400)).toBe(false);
  });
});