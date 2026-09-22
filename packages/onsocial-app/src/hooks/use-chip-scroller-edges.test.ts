import { describe, expect, it } from 'vitest';
import { chipScrollerEdges } from '@/hooks/use-chip-scroller-edges';

describe('chipScrollerEdges', () => {
  it('stays quiet when every chip fits', () => {
    expect(
      chipScrollerEdges({ scrollWidth: 200, clientWidth: 200, scrollLeft: 0 })
    ).toEqual({ start: false, end: false });
  });

  it('fades the end while later chips are clipped', () => {
    expect(
      chipScrollerEdges({ scrollWidth: 401, clientWidth: 288, scrollLeft: 0 })
    ).toEqual({ start: false, end: true });
  });

  it('fades both edges in the middle of a rail', () => {
    expect(
      chipScrollerEdges({ scrollWidth: 401, clientWidth: 288, scrollLeft: 40 })
    ).toEqual({ start: true, end: true });
  });

  it('fades only the start once the rail is scrolled to the end', () => {
    expect(
      chipScrollerEdges({
        scrollWidth: 401,
        clientWidth: 288,
        scrollLeft: 113,
      })
    ).toEqual({ start: true, end: false });
  });
});
