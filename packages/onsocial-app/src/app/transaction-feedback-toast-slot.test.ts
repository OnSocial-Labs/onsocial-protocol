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

  it('uses the same dock frost plate as .os-dock-pill (no transform/opacity on the host)', () => {
    const host = css.slice(
      css.indexOf('.app-tx-toast {'),
      css.indexOf('@keyframes app-tx-toast-in')
    );
    expect(host).toContain('--os-dock-fill: rgb(var(--bg-rgb) / 0.72)');
    expect(host).toContain('background: var(--os-dock-fill)');
    expect(host).toContain('backdrop-filter: blur(20px) saturate(1.3)');
    expect(host).toContain('box-shadow: var(--os-dock-shadow), var(--os-dock-lip)');
    expect(host).not.toContain('animation:');
    expect(css).toContain('justify-content: center');
    expect(css).not.toContain('mood-accent');
    // Transform / opacity-both on the frost host empties backdrop-filter.
    expect(css).not.toContain('translateX(-50%)');
    expect(css).not.toContain('translateY(6px)');
    // Frost on the host — not a ::before under overflow:hidden.
    expect(css).not.toContain('.app-tx-toast::before');
    // -webkit- pair makes Lightning drop the blur (same rule as dock).
    expect(css).not.toContain('-webkit-backdrop-filter');
    expect(css).toContain(
      'animation: app-tx-toast-in 180ms cubic-bezier(0.22, 1, 0.36, 1) both'
    );
  });
});
