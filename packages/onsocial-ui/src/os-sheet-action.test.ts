import { describe, expect, it } from 'vitest';
import {
  osSheetActionClassName,
  OsSheetAction,
  OsSheetGhostAction,
  OsSheetPrimaryAction,
} from './os-sheet-action.js';

describe('OsSheetAction', () => {
  it('exports the shared sheet action class', () => {
    expect(osSheetActionClassName).toBe('os-sheet-action');
  });

  it('exports button components', () => {
    expect(typeof OsSheetAction).toBe('function');
    expect(typeof OsSheetPrimaryAction).toBe('function');
    expect(typeof OsSheetGhostAction).toBe('function');
  });
});
