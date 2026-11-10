import { describe, expect, it } from 'vitest';
import { boxesMeet, chevronFloatBox } from './portfolio-summon-dock';

describe('chevron float cover', () => {
  it('builds the floating box from the pill, the face size, and the ring', () => {
    const box = chevronFloatBox({ left: 100, top: 700, width: 200 }, 30, 4);
    expect(box).toEqual({
      left: 100 + 100 - 15 - 4,
      right: 100 + 100 + 15 + 4,
      top: 700 - 4 - 30 - 4,
      bottom: 700 - 4 + 4,
    });
  });

  it('clears the cover when the boxes no longer meet', () => {
    const float = chevronFloatBox({ left: 0, top: 400, width: 100 }, 30, 4);
    const clear = { left: 0, top: 0, right: 100, bottom: 100 };
    const over = {
      left: float.left,
      top: float.top,
      right: float.right,
      bottom: float.bottom,
    };
    expect(boxesMeet(float, clear)).toBe(false);
    expect(boxesMeet(float, over)).toBe(true);
  });
});
