import { describe, expect, it } from 'vitest';
import { resolveSheetPointerRelease } from './glass-sheet.js';

describe('sheet drag release', () => {
  it('asks to close past the dismiss gap and still clears the offset', () => {
    expect(
      resolveSheetPointerRelease({
        currentY: 200,
        peekPx: 0,
        dismissGapPx: 96,
      })
    ).toEqual({ requestClose: true, dragPx: null });
  });

  it('settles a short pull without asking to close', () => {
    expect(
      resolveSheetPointerRelease({
        currentY: 40,
        peekPx: 0,
        dismissGapPx: 96,
      })
    ).toEqual({ requestClose: false, dragPx: null });
  });

  it('clears the offset when a refused close leaves the sheet open', () => {
    const release = resolveSheetPointerRelease({
      currentY: 180,
      peekPx: 24,
      dismissGapPx: 96,
    });
    expect(release.requestClose).toBe(true);
    expect(release.dragPx).toBeNull();
  });
});
