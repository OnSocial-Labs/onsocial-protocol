import { describe, expect, it } from 'vitest';
import {
  GLASS_SHEET_PEEK_RATIO,
  GlassSheet,
  SheetHeader,
  resolveBackdropPresentation,
  resolvePanelPresentation,
  resolveSheetCoverProgress,
  resolveSheetOffsetPx,
  resolveSheetPeekOffsetPx,
} from './glass-sheet.js';

describe('GlassSheet', () => {
  it('exports sheet primitives', () => {
    expect(typeof GlassSheet).toBe('function');
    expect(typeof SheetHeader).toBe('function');
    expect(GLASS_SHEET_PEEK_RATIO).toBe(0.62);
  });
});

describe('resolveSheetCoverProgress', () => {
  it('maps offset to 0–1 cover progress', () => {
    expect(resolveSheetCoverProgress(0, 720)).toBe(0);
    expect(resolveSheetCoverProgress(360, 720)).toBe(0.5);
    expect(resolveSheetCoverProgress(720, 720)).toBe(1);
    expect(resolveSheetCoverProgress(900, 720)).toBe(1);
  });

  it('returns 0 when panel height is unknown', () => {
    expect(resolveSheetCoverProgress(120, 0)).toBe(0);
  });
});

describe('resolveSheetPeekOffsetPx', () => {
  it('returns 0 when content fits within the peek window', () => {
    expect(resolveSheetPeekOffsetPx(320, 0.46, 800)).toBe(0);
  });

  it('offsets tall content to reveal a peek window', () => {
    expect(resolveSheetPeekOffsetPx(720, 0.62, 800)).toBe(224);
  });
});

describe('resolveSheetOffsetPx', () => {
  it('uses drag position when dragging', () => {
    expect(
      resolveSheetOffsetPx(180, 'full', 720, GLASS_SHEET_PEEK_RATIO, false, 800)
    ).toBe(180);
  });

  it('uses drag position on desktop while dragging', () => {
    expect(
      resolveSheetOffsetPx(180, 'full', 720, GLASS_SHEET_PEEK_RATIO, true, 800)
    ).toBe(180);
  });

  it('returns 0 on desktop and at full detent', () => {
    expect(
      resolveSheetOffsetPx(null, 'full', 720, GLASS_SHEET_PEEK_RATIO, true, 800)
    ).toBe(0);
    expect(
      resolveSheetOffsetPx(
        null,
        'full',
        720,
        GLASS_SHEET_PEEK_RATIO,
        false,
        800
      )
    ).toBe(0);
  });

  it('skips peek offset when content is shorter than the peek window', () => {
    expect(resolveSheetOffsetPx(null, 'peek', 320, 0.46, false, 800)).toBe(0);
  });
});

describe('resolveBackdropPresentation', () => {
  it('is strongest when fully presented (dim + blur under the sheet)', () => {
    const presented = resolveBackdropPresentation(0);
    expect(presented.opacity).toBe(1);
    expect(presented.filter).toContain('blur(16px)');
    expect(presented.filter).toContain('saturate(');
  });

  it('clears when fully covered down', () => {
    const dismissed = resolveBackdropPresentation(1);
    expect(dismissed.opacity).toBe(0);
    expect(dismissed.filter).toBe('blur(0px)');
  });

  it('interpolates mid drag opacity and blur', () => {
    const mid = resolveBackdropPresentation(0.5);
    expect(mid.opacity).toBe(0.5);
    expect(mid.filter).toContain('blur(8px)');
  });

  it('stays dim-only when reduced transparency is preferred', () => {
    const presented = resolveBackdropPresentation(0, {
      reduceTransparency: true,
    });
    expect(presented.opacity).toBe(1);
    expect(presented.filter).toBe('blur(0px)');
  });
});

describe('resolvePanelPresentation', () => {
  it('keeps panel frost at full presentation', () => {
    expect(resolvePanelPresentation(0, 'os')).toContain('blur(12px)');
  });

  it('eases panel frost while dragging down', () => {
    expect(resolvePanelPresentation(0.5, 'os')).toContain('blur(6px)');
  });

  it('skips panel blur when reduced transparency is preferred', () => {
    expect(
      resolvePanelPresentation(0, 'os', undefined, {
        reduceTransparency: true,
      })
    ).toBe('blur(0px)');
  });
});
