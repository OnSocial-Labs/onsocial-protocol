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
});
