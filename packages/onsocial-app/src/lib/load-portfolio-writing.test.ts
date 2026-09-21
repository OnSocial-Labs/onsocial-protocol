import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'load-portfolio-writing.ts'),
  'utf8'
);

describe('loadPortfolioWritingChrome', () => {
  it('skips the live exists probe when writing=shelf cookie is set', () => {
    expect(src).toContain('e2eWritingShelfChrome');
    expect(src).toContain('isE2eWritingShelfCookie');
    expect(src).toContain('e2eGraphStubsAllowed');
    expect(src).toContain('if (stubChrome) return stubChrome');
  });

  it('paints chrome from shell + page config and never 404s the shelf', () => {
    expect(src).toContain('loadWritingPageConfig');
    expect(src).toContain('loadProfileShell');
    expect(src).toContain('pages.getConfig');
    expect(src).not.toContain('fetchPublicPageData');
    expect(src).not.toContain('notFound');
    expect(src).not.toContain('account/exists');
  });
});
