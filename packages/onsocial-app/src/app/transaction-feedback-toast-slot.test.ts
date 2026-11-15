import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'transaction-feedback-toast.css'),
  'utf8'
);

describe('transaction toast slot', () => {
  it('uses the top slot while the wallet picker is open', () => {
    const rule = css.slice(
      css.indexOf('body:has(.glass-sheet-root'),
      css.indexOf('.app-tx-toast {')
    );
    expect(rule).toContain('.hot-connector-popup');
    expect(rule).toContain('top: calc(env(safe-area-inset-top, 0px) + 0.75rem)');
    expect(rule).toContain('bottom: auto');
  });

  it('tints pending PulsingDots protocol green', () => {
    expect(css).toContain('.app-tx-toast-pending-dots');
    expect(css).toContain('var(--protocol-green)');
    expect(css).not.toContain('.app-tx-toast-spinner');
    expect(css).not.toContain('.app-tx-toast-icon--pending');
  });

  it('uses neutral elevated chrome frost, not mood dock fill', () => {
    expect(css).toContain('rgb(var(--bg-rgb) / 0.72)');
    expect(css).toContain('blur(20px) saturate(1.3)');
    expect(css).toContain('inset 0 1px 0 rgb(var(--fg-rgb) / 0.1)');
    expect(css).not.toContain('--os-dock-fill');
    expect(css).not.toContain('mood-accent');
  });
});
