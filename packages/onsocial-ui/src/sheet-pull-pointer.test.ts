import { describe, expect, it } from 'vitest';
import {
  sheetPullPointerCanDrag,
  sheetShouldBlockTextSelection,
} from './sheet-body-pull.js';

describe('sheet pull pointer', () => {
  it('pulls for touch and pen, and never for a mouse', () => {
    expect(sheetPullPointerCanDrag('touch')).toBe(true);
    expect(sheetPullPointerCanDrag('pen')).toBe(true);
    expect(sheetPullPointerCanDrag('mouse')).toBe(false);
    expect(sheetPullPointerCanDrag('')).toBe(false);
  });

  it('blocks selection only after a pull is confirmed', () => {
    expect(sheetShouldBlockTextSelection(null)).toBe(false);
    expect(sheetShouldBlockTextSelection('pending')).toBe(false);
    expect(sheetShouldBlockTextSelection('abort')).toBe(false);
    expect(sheetShouldBlockTextSelection('pull')).toBe(true);
  });
});
