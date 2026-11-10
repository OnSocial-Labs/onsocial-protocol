import { describe, expect, it } from 'vitest';
import { boxesMeet } from './portfolio-summon-dock';

/** 390 at 200%. Caption bottom 612.7. Lifted hint 600–636. */
const hintAt200 = { left: 132.7, top: 600, right: 257.3, bottom: 636 };
const captionAt200 = { left: 24, top: 572.9, right: 366, bottom: 612.7 };
/** 390 at 175%. Caption ends at 572, above the lifted hint. */
const captionAt175 = { left: 21, top: 537.2, right: 369, bottom: 572 };

describe('lifted hint cover', () => {
  it('hides the hint when the lifted box meets the standing caption', () => {
    expect(boxesMeet(hintAt200, captionAt200)).toBe(true);
  });

  it('shows the hint when the lifted box is clear of the caption', () => {
    expect(boxesMeet(hintAt200, captionAt175)).toBe(false);
  });

  it('shows the hint when the caption edge only touches the lifted box', () => {
    const touching = {
      left: captionAt200.left,
      top: 560,
      right: captionAt200.right,
      bottom: hintAt200.top,
    };
    expect(boxesMeet(hintAt200, touching)).toBe(false);
  });
});
