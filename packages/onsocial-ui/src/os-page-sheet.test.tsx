import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OsPageSheet, osPageSheetPanelClassName } from './os-page-sheet.js';

const here = dirname(fileURLToPath(import.meta.url));
const glassSheetCss = readFileSync(join(here, '../glass-sheet.css'), 'utf8');

describe('OsPageSheet', () => {
  it('exports the page shell and panel class', () => {
    expect(typeof OsPageSheet).toBe('function');
    expect(osPageSheetPanelClassName).toBe('os-page-sheet-panel');
  });

  it('forwards appear so editors over Account do not slide as a push', () => {
    const source = readFileSync(join(here, 'os-page-sheet.tsx'), 'utf8');
    expect(source).toContain('presentation={presentation}');
    expect(source).not.toContain(
      "presentation === 'swap' ? { presentation }"
    );
  });

  it('paints page surface as solid --bg, never inherited --mood-bg', () => {
    expect(glassSheetCss).toMatch(
      /\.glass-sheet-panel\[data-surface='page'\] \{[\s\S]*?background: var\(--bg/
    );
    expect(glassSheetCss).not.toMatch(
      /\.glass-sheet-panel\[data-surface='page'\] \{[\s\S]*?background: var\(--mood-bg/
    );
  });
});
