import { describe, expect, it } from 'vitest';
import { osIconActionClassName, OsIconAction } from './os-icon-action.js';

describe('OsIconAction', () => {
  it('exports the shared glass icon action class', () => {
    expect(osIconActionClassName).toBe('glass-sheet-icon-action');
  });

  it('exports a button component', () => {
    expect(typeof OsIconAction).toBe('function');
  });
});
