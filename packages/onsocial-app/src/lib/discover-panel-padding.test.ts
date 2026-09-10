import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appSrc = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('discover panel padding', () => {
  it('uses the shared page inset instead of legacy standing padding', () => {
    const discover = readFileSync(
      join(appSrc, 'features/discover/discover-panel-content.tsx'),
      'utf8'
    );
    const globals = readFileSync(join(appSrc, 'app/globals.css'), 'utf8');

    expect(discover).toContain(
      '<OsAppChromePage className="discover-panel">'
    );
    expect(discover).not.toContain(
      '<OsAppChromePage className="standing-panel discover-panel">'
    );
    expect(globals).toMatch(
      /\.os-app-chrome-page\.discover-panel \{[\s\S]*?gap: 0\.65rem;/
    );
  });
});
