import { describe, expect, it } from 'vitest';
import {
  DiscardConfirmFooter,
  discardConfirmFooterA11y,
  useDiscardConfirm,
} from './discard-confirm.js';
import {
  SheetFactCopy,
  SheetFactCount,
  SheetFactRow,
  SheetFactSection,
} from './sheet-facts.js';

describe('SheetFact*', () => {
  it('exports fact chrome helpers', () => {
    expect(typeof SheetFactSection).toBe('function');
    expect(typeof SheetFactRow).toBe('function');
    expect(typeof SheetFactCopy).toBe('function');
    expect(typeof SheetFactCount).toBe('function');
  });
});

describe('discard-confirm', () => {
  it('exports hook, footer, and a11y helper', () => {
    expect(typeof useDiscardConfirm).toBe('function');
    expect(typeof DiscardConfirmFooter).toBe('function');
    expect(discardConfirmFooterA11y(false, 't', 'b')).toEqual({});
    expect(discardConfirmFooterA11y(true, 't', 'b')).toEqual({
      role: 'alertdialog',
      'aria-modal': true,
      'aria-labelledby': 't',
      'aria-describedby': 'b',
    });
  });
});
