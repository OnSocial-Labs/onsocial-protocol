import { describe, expect, it } from 'vitest';
import { nextPostLayerZIndex, SHEET_Z } from './sheet-z';

describe('nextPostLayerZIndex', () => {
  it('keeps the first post/drop under media faces so Reply can open on it', () => {
    expect(nextPostLayerZIndex(null)).toBe(SHEET_Z.overlayHost);
    expect(nextPostLayerZIndex(null)).toBeLessThan(SHEET_Z.shell);
  });

  it('lifts the first sheet over an already-open media face', () => {
    expect(nextPostLayerZIndex(null, true)).toBe(SHEET_Z.overShell);
    expect(nextPostLayerZIndex(null, true)).toBeGreaterThan(SHEET_Z.shell);
  });

  it('lifts a nested reply above the parent and above media faces', () => {
    expect(nextPostLayerZIndex(SHEET_Z.overlayHost)).toBe(SHEET_Z.overShell);
    expect(nextPostLayerZIndex(SHEET_Z.overShell)).toBe(SHEET_Z.overShell + 1);
  });
});
