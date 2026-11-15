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

  it('uses neutral dock frost tokens, not mood accent mix', () => {
    expect(css).toContain('--os-dock-fill: rgb(var(--bg-rgb) / 0.72)');
    expect(css).toContain('background: var(--os-dock-fill)');
    expect(css).toContain('box-shadow: var(--os-dock-shadow), var(--os-dock-lip)');
    expect(css).toContain('backdrop-filter: blur(20px) saturate(1.3)');
    expect(css).not.toContain('mood-accent');
    // -webkit- pair makes Lightning drop the blur (same rule as dock/footer).
    expect(css).not.toContain('-webkit-backdrop-filter');
  });
});
