import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('DAO drawer sheets', () => {
  it('lifts the protocol pager for the whole mounted sheet and slide-over', () => {
    const css = readFileSync(join(here, '../../app/globals.css'), 'utf8');
    expect(css).toContain(
      '.protocol-face-pair:has(.glass-sheet-root) .protocol-face-pager'
    );
    expect(css).toContain(
      ".protocol-face-pair:has([data-os-slide-over='true']) .protocol-face-pager"
    );
    expect(css).not.toContain(
      '.glass-sheet-root.is-visible) .protocol-face-pager'
    );
    expect(css).not.toContain("[data-os-slide-over='true']:not(.is-closing)");
  });

  it('keeps Manage tool drawers mounted until the sheet exit finishes', () => {
    const host = readFileSync(
      join(here, 'dao-workspace-tools-host.tsx'),
      'utf8'
    );
    const panel = readFileSync(join(here, 'dao-workspace-panel.tsx'), 'utf8');
    expect(host).toContain('setMounted');
    expect(host).toContain('onToolsHostClosed={handleClosed}');
    expect(host).not.toContain('if (!open) return null');
    expect(panel).toContain('noteToolSheetClosed');
    expect(panel).toContain('onToolsHostClosed?.()');
    expect(panel).toContain(
      'onClosed={toolsHostOnly ? noteToolSheetClosed : undefined}'
    );
  });

  it('hands Manage off to the next surface under one replace', () => {
    const manage = readFileSync(join(here, 'dao-manage-sheet.tsx'), 'utf8');
    const chrome = readFileSync(
      join(here, '../../components/portfolio/portfolio-dao-org-chrome.tsx'),
      'utf8'
    );
    expect(manage).toContain('replaceSheet()');
    expect(chrome).toContain('replaceSheet()');
    expect(manage).not.toContain('setSheetHandoff');
    expect(chrome).not.toContain('setSheetHandoff');
  });
});
