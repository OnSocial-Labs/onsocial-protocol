import { describe, expect, it } from 'vitest';
import {
  scarceChoiceChipClassName,
  scarceChoiceSheetBodyClassName,
  scarceChoiceSheetPanelClassName,
} from './choice-drawer.js';
import {
  actionDrawerConfirmCancelClassName,
  actionDrawerConfirmClassName,
  actionDrawerIconClassName,
} from './action-drawer.js';

describe('choice / action drawer class names', () => {
  it('exports stable class names', () => {
    expect(scarceChoiceChipClassName).toBe('scarce-choice-chip');
    expect(scarceChoiceSheetPanelClassName).toBe('scarce-choice-sheet-panel');
    expect(scarceChoiceSheetBodyClassName).toBe('scarce-choice-sheet-body');
    expect(actionDrawerIconClassName).toBe('action-drawer-icon');
    expect(actionDrawerConfirmClassName).toBe('action-drawer-confirm');
    expect(actionDrawerConfirmCancelClassName).toBe(
      'action-drawer-confirm-cancel'
    );
  });
});
