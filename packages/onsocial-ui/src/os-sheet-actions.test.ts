import { describe, expect, it } from 'vitest';
import {
  osSheetActionExpandedClassName,
  osSheetActionInertSlotClassName,
  osSheetActionsBorderlessClassName,
  osSheetActionsClassName,
  OsSheetActions,
} from './os-sheet-actions.js';

describe('OsSheetActions', () => {
  it('exports shared class names', () => {
    expect(osSheetActionsClassName).toBe('os-sheet-actions');
    expect(osSheetActionExpandedClassName).toBe('os-sheet-action--expanded');
    expect(osSheetActionInertSlotClassName).toBe('os-sheet-action--inert-slot');
    expect(osSheetActionsBorderlessClassName).toBe(
      'os-sheet-actions--borderless'
    );
  });

  it('exports the group component', () => {
    expect(typeof OsSheetActions).toBe('function');
  });
});
