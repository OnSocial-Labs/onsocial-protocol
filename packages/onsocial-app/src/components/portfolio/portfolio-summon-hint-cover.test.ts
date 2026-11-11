import { describe, expect, it } from 'vitest';
import {
  CHEVRON_FOCUS_RING_PX,
  boxesMeet,
  liftedHintHitsContent,
} from './portfolio-summon-dock';

/** Measured 390 at 200%. Caption bottom 612.7. Lifted hint 600–636. */
const hintAt200 = {
  left: 132.7,
  top: 600,
  right: 257.3,
  bottom: 636,
  width: 124.6,
  height: 36,
};
const captionAt200 = { left: 24, top: 572.9, right: 366, bottom: 612.7 };
/** Measured 390 at 175%. Caption ends at 572, above the lifted hint. */
const captionAt175 = { left: 21, top: 537.2, right: 369, bottom: 572 };

describe('lifted hint cover', () => {
  it('hides the hint when the lifted box meets the standing caption', () => {
    expect(liftedHintHitsContent(hintAt200, captionAt200)).toBe(true);
  });

  it('shows the hint when the lifted box is clear of the caption', () => {
    expect(liftedHintHitsContent(hintAt200, captionAt175)).toBe(false);
  });

  it('hides the hint when only the focus-ring pad meets the caption', () => {
    const pad = CHEVRON_FOCUS_RING_PX;
    const content = {
      left: hintAt200.left,
      top: hintAt200.top - 40,
      right: hintAt200.right,
      bottom: hintAt200.top - pad,
    };
    expect(
      boxesMeet(
        {
          left: hintAt200.left,
          top: hintAt200.top,
          right: hintAt200.right,
          bottom: hintAt200.bottom,
        },
        content
      )
    ).toBe(false);
    expect(liftedHintHitsContent(hintAt200, content)).toBe(true);
  });

  it('shows the hint when the caption sits just past the focus-ring pad', () => {
    const content = {
      left: hintAt200.left,
      top: hintAt200.top - 40,
      right: hintAt200.right,
      bottom: hintAt200.top - CHEVRON_FOCUS_RING_PX - 1,
    };
    expect(liftedHintHitsContent(hintAt200, content)).toBe(false);
  });
});
