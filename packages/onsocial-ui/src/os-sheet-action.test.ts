import { describe, expect, it } from 'vitest';
import { osSheetActionClassName, OsSheetAction } from './os-sheet-action.js';

describe('OsSheetAction', () => {
  it('exports the shared sheet action class', () => {
    expect(osSheetActionClassName).toBe('os-sheet-action');
  });

  it('exports the sheet action button', () => {
    expect(typeof OsSheetAction).toBe('function');
  });
});
