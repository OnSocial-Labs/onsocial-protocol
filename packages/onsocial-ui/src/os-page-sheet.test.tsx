import { describe, expect, it } from 'vitest';
import { OsPageSheet, osPageSheetPanelClassName } from './os-page-sheet.js';

describe('OsPageSheet', () => {
  it('exports the page shell and panel class', () => {
    expect(typeof OsPageSheet).toBe('function');
    expect(osPageSheetPanelClassName).toBe('os-page-sheet-panel');
  });
});
