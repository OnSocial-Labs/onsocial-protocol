import { describe, expect, it } from 'vitest';
import { nextPostLayerZIndex, postLayerOverlayZ, SHEET_Z } from './sheet-z';

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

describe('postLayerOverlayZ', () => {
  it('keeps feed overlays on the constant bands', () => {
    expect(postLayerOverlayZ(null)).toEqual({
      face: SHEET_Z.shell,
      sheet: SHEET_Z.overShell,
      composer: SHEET_Z.confirm,
      dock: null,
    });
  });

  it('keeps a normal post sheet under the face and the constant dock', () => {
    expect(postLayerOverlayZ(SHEET_Z.overlayHost)).toEqual({
      face: SHEET_Z.shell,
      sheet: SHEET_Z.overShell,
      composer: SHEET_Z.confirm,
      dock: null,
    });
  });

  it('puts the cover, dock, and composer above a face-lifted layer', () => {
    const rendered = SHEET_Z.overShell + 80;
    const overlay = postLayerOverlayZ(rendered);
    expect(overlay.face).toBeGreaterThan(rendered);
    expect(overlay.dock).toBeGreaterThan(overlay.face);
    expect(overlay.sheet).toBeGreaterThan(overlay.dock ?? 0);
    expect(overlay.composer).toBeGreaterThan(overlay.sheet);
  });
});
