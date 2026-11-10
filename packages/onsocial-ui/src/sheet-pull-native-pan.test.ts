import { describe, expect, it } from 'vitest';
import {
  SHEET_PULL_OPT_OUT_SELECTOR,
  elementOptsOutOfSheetPull,
  sheetPullOptOutFromClosest,
  sheetTouchMovePreventsNativePan,
} from './sheet-body-pull.js';

describe('sheet pull native pan', () => {
  it('lets the touch scroll until a pull is confirmed', () => {
    expect(sheetTouchMovePreventsNativePan(null)).toBe(false);
    expect(sheetTouchMovePreventsNativePan('pending')).toBe(false);
    expect(sheetTouchMovePreventsNativePan('abort')).toBe(false);
    expect(sheetTouchMovePreventsNativePan('pull')).toBe(true);
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
