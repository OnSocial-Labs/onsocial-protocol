import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('useViewerDockMood', () => {
  it('seeds protocol mood vars before the wallet mood fetch lands', () => {
    const source = readFileSync(join(here, 'use-viewer-dock-mood.ts'), 'utf8');
    expect(source).toContain('portfolioMoodShellStyle(fallbackMood.cssVars)');
    expect(source).toContain(
      'pageContentDrawerPanelStyle(fallbackMood.cssVars)'
    );
    expect(source).toContain('fetchedMoodStyle) return fetchedMoodStyle');
    expect(source).not.toContain('return undefined;\n  }, [accountId, fetchedMoodStyle]);');
  });
});
