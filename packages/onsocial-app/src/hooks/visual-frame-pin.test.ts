import { describe, expect, it } from 'vitest';
import {
  correctedFrameTop,
  visualFramePin,
} from '@/hooks/use-visual-viewport-sheet';

describe('visualFramePin', () => {
  it('covers a fixed page from the top of the visible screen', () => {
    expect(
      visualFramePin({
        position: 'fixed',
        parentTop: 0,
        parentHeight: 844,
        offsetTop: 0,
        visualHeight: 520,
      })
    ).toEqual({ top: 0, height: 520 });
  });

  it('follows the visual viewport when the browser scrolls the page up', () => {
    expect(
      visualFramePin({
        position: 'fixed',
        parentTop: -140,
        parentHeight: 844,
        offsetTop: 140,
        visualHeight: 520,
      })
    ).toEqual({ top: 140, height: 520 });
  });

  it('pins an absolute page inside a card that still fills the layout', () => {
    expect(
      visualFramePin({
        position: 'absolute',
        parentTop: -140,
        parentHeight: 844,
        offsetTop: 140,
        visualHeight: 520,
      })
    ).toEqual({ top: 140, height: 520 });
  });

  it('pulls a scrolled page back when the card rect stays on screen', () => {
    expect(
      correctedFrameTop({
        appliedTop: 0,
        frameTop: -280,
        parentTop: 0,
      })
    ).toBe(280);
  });

  it('does not stack that correction once the header is back', () => {
    expect(
      correctedFrameTop({
        appliedTop: 280,
        frameTop: 0,
        parentTop: 0,
      })
    ).toBe(280);
  });

  it('follows a card that itself moved above the screen', () => {
    expect(
      correctedFrameTop({
        appliedTop: 0,
        frameTop: -140,
        parentTop: -140,
      })
    ).toBe(140);
  });

  it('leaves a card that already ends on the keys', () => {
    expect(
      visualFramePin({
        position: 'absolute',
        parentTop: 0,
        parentHeight: 520,
        offsetTop: 0,
        visualHeight: 520,
      })
    ).toEqual({ top: 0, height: 520 });
  });
});
