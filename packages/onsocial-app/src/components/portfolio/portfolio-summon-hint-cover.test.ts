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

  it('shows the hint when there is no caption', () => {
    expect(boxesMeet(hintAt200, captionAt200)).toBe(true);
    const captions: Array<typeof captionAt200> = [];
    expect(captions.some((caption) => boxesMeet(hintAt200, caption))).toBe(
      false
    );
  });

  it('hides at the measured 390 200% boxes', () => {
    expect(captionAt200.bottom).toBe(612.7);
    expect(hintAt200.top).toBe(600);
    expect(hintAt200.bottom).toBe(636);
    expect(boxesMeet(hintAt200, captionAt200)).toBe(true);
  });
});
