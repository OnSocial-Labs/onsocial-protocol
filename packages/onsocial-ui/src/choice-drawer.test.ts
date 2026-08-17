import { describe, expect, it } from 'vitest';
import {
  osChoiceChipClassName,
  osChoiceSheetBodyClassName,
  osChoiceSheetPanelClassName,
} from './choice-drawer.js';
import {
  osActionDrawerConfirmCancelClassName,
  osActionDrawerConfirmClassName,
  osActionDrawerIconClassName,
} from './action-drawer.js';

describe('choice / action drawer class names', () => {
  it('exports stable class names', () => {
    expect(osChoiceChipClassName).toBe('os-choice-chip');
    expect(osChoiceSheetPanelClassName).toBe('os-choice-sheet-panel');
    expect(osChoiceSheetBodyClassName).toBe('os-choice-sheet-body');
    expect(osActionDrawerIconClassName).toBe('os-action-drawer-icon');
    expect(osActionDrawerConfirmClassName).toBe('os-action-drawer-confirm');
    expect(osActionDrawerConfirmCancelClassName).toBe(
      'os-action-drawer-confirm-cancel'
    );
  });
});
