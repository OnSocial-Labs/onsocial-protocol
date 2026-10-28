import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveHandoffPresentation } from './sheet-handoff.js';

describe('resolveHandoffPresentation', () => {
  it('swaps a default enter when one sheet replaces another', () => {
    expect(resolveHandoffPresentation('enter', true)).toBe('swap');
  });

  it('leaves appear and swap alone', () => {
    expect(resolveHandoffPresentation('appear', true)).toBe('appear');
    expect(resolveHandoffPresentation('swap', true)).toBe('swap');
  });

  it('keeps the enter slide when nothing is handing off', () => {
    expect(resolveHandoffPresentation('enter', false)).toBe('enter');
  });
});

describe('sheet handoff crossfade', () => {
  it('fades opacity only and does not move the sheet', () => {
    const cssPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '../glass-sheet.css'
    );
    const css = readFileSync(cssPath, 'utf8');
    const keyframes = css.slice(
      css.indexOf('@keyframes glass-sheet-crossfade'),
      css.indexOf('.glass-sheet-panel.is-open.glass-sheet-panel--enter')
    );
    expect(keyframes).toContain('opacity: 0.72');
    expect(keyframes).toContain('opacity: 1');
    expect(keyframes).not.toContain('transform');
    expect(css).toContain(".glass-sheet-panel[data-crossfade='true'].is-open");
  });
});
