import { describe, expect, it } from 'vitest';
import {
  sheetPullPointerCanDrag,
  sheetShouldBlockTextSelection,
} from './sheet-body-pull.js';

describe('sheet pull pointer', () => {
  it('pulls for mouse, touch, and pen', () => {
    expect(sheetPullPointerCanDrag('mouse')).toBe(true);
    expect(sheetPullPointerCanDrag('touch')).toBe(true);
    expect(sheetPullPointerCanDrag('pen')).toBe(true);
    expect(sheetPullPointerCanDrag('')).toBe(false);
  });

  it('blocks selection only after a pull is confirmed', () => {
    expect(sheetShouldBlockTextSelection(null)).toBe(false);
    expect(sheetShouldBlockTextSelection('pending')).toBe(false);
    expect(sheetShouldBlockTextSelection('abort')).toBe(false);
    expect(sheetShouldBlockTextSelection('pull')).toBe(true);
  });
});
