import { describe, expect, it } from 'vitest';
import { finalizeAmountInput, normalizeAmountInput } from './amount-input.js';
import { AmountField, osAmountFieldClassName } from './amount-field.js';
import {
  OsGestureSheet,
  osGestureSheetPanelClassName,
} from './os-gesture-sheet.js';
import { SuffixField, osSuffixFieldClassName } from './suffix-field.js';

describe('amount-input', () => {
  it('normalizes typing and finalizes blur', () => {
    expect(normalizeAmountInput('1,25', 2)).toBe('1.25');
    expect(normalizeAmountInput('.5', 2)).toBe('0.5');
    expect(finalizeAmountInput('1.2500', 4)).toBe('1.25');
    expect(finalizeAmountInput('3.', 2)).toBe('3');
  });
});

describe('AmountField / SuffixField', () => {
  it('exports field shells and class tokens', () => {
    expect(typeof AmountField).toBe('function');
    expect(typeof SuffixField).toBe('function');
    expect(osAmountFieldClassName).toBe('os-amount-field');
    expect(osSuffixFieldClassName).toBe('os-suffix-field');
  });
});

describe('OsGestureSheet', () => {
  it('exports the gesture sheet shell and panel class', () => {
    expect(typeof OsGestureSheet).toBe('function');
    expect(osGestureSheetPanelClassName).toBe('os-gesture-sheet-panel');
  });
});
