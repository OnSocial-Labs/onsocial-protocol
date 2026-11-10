import { describe, expect, it } from 'vitest';
import {
  SHEET_PULL_OPT_OUT_SELECTOR,
  elementOptsOutOfSheetPull,
  sheetPullOptOutFromClosest,
  sheetShouldClaimFirstDownwardMove,
  sheetTouchMovePreventsNativePan,
} from './sheet-body-pull.js';

describe('sheet pull native pan', () => {
  it('lets the touch scroll until a pull is confirmed', () => {
    expect(sheetTouchMovePreventsNativePan(null)).toBe(false);
    expect(sheetTouchMovePreventsNativePan('pending')).toBe(false);
    expect(sheetTouchMovePreventsNativePan('abort')).toBe(false);
    expect(sheetTouchMovePreventsNativePan('pull')).toBe(true);
  });

  it('claims only the first downward move while a pull is still pending', () => {
    expect(
      sheetShouldClaimFirstDownwardMove({
        phase: 'pending',
        dx: 2,
        dy: 8,
        alreadyClaimed: false,
      })
    ).toBe(true);
    expect(
      sheetShouldClaimFirstDownwardMove({
        phase: 'pending',
        dx: 2,
        dy: 8,
        alreadyClaimed: true,
      })
    ).toBe(false);
    expect(
      sheetShouldClaimFirstDownwardMove({
        phase: 'pending',
        dx: 12,
        dy: 4,
        alreadyClaimed: false,
      })
    ).toBe(false);
    expect(
      sheetShouldClaimFirstDownwardMove({
        phase: 'pull',
        dx: 0,
        dy: 20,
        alreadyClaimed: false,
      })
    ).toBe(false);
    expect(
      sheetShouldClaimFirstDownwardMove({
        phase: null,
        dx: 0,
        dy: 20,
        alreadyClaimed: false,
      })
    ).toBe(false);
  });

  it('opts out maps, canvases, and carousels that set the attribute', () => {
    expect(SHEET_PULL_OPT_OUT_SELECTOR).toBe('[data-sheet-pull="off"]');
    expect(sheetPullOptOutFromClosest(undefined)).toBe(false);
    expect(
      sheetPullOptOutFromClosest((selector) =>
        selector === SHEET_PULL_OPT_OUT_SELECTOR ? {} : null
      )
    ).toBe(true);
    expect(sheetPullOptOutFromClosest(() => null)).toBe(false);
    expect(elementOptsOutOfSheetPull(null)).toBe(false);
  });
});
