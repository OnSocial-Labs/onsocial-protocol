import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isPortfolioFaceHref } from './post-thread-layer';

const here = dirname(fileURLToPath(import.meta.url));
const layer = readFileSync(join(here, 'post-thread-layer.tsx'), 'utf8');

describe('article place layer', () => {
  it('does not stack a guest Writing or face over the essay', () => {
    expect(layer).not.toContain('openWriting');
    expect(layer).not.toContain('LiveWritingShelfPanel');
    expect(layer).not.toContain("kind: 'writing'");
    expect(layer).not.toContain('openFace');
    expect(layer).not.toContain('LivePortfolioFacePanel');
    expect(layer).not.toContain("kind: 'face'");
  });

  it('treats only a portfolio face as leaving the post drawer', () => {
    expect(isPortfolioFaceHref('/@alice.testnet')).toBe(true);
    expect(isPortfolioFaceHref('/@alice.testnet?from=home')).toBe(true);
    expect(isPortfolioFaceHref('/@alice.testnet/posts/1')).toBe(false);
    expect(isPortfolioFaceHref('/@alice.testnet/standing/incoming')).toBe(
      false
    );
    expect(isPortfolioFaceHref('/home')).toBe(false);
  });
});
