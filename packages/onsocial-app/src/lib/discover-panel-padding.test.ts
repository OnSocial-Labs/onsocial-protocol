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

  it('cold route + overlay opening wrap skeletons in OsAppChromePage', () => {
    const loadingScreen = readFileSync(
      join(appSrc, 'features/discover/discover-loading-screen.tsx'),
      'utf8'
    );
    const sheetOpening = readFileSync(
      join(appSrc, 'features/discover/discover-sheet-opening.tsx'),
      'utf8'
    );
    const loadingRoute = readFileSync(
      join(appSrc, 'app/(app)/discover/loading.tsx'),
      'utf8'
    );
    const page = readFileSync(
      join(appSrc, 'app/(app)/discover/page.tsx'),
      'utf8'
    );

    expect(loadingScreen).toContain(
      'className="discover-panel"'
    );
    expect(loadingScreen).toContain('OsAppChromePage');
    expect(sheetOpening).toContain('OsAppChromePage');
    expect(sheetOpening).not.toMatch(
      /<div\s+className="discover-panel"/
    );
    expect(loadingRoute).toContain(
      'fallback={<DiscoverLoadingScreen tab="trending" />}'
    );
    expect(loadingRoute).not.toContain('fallback={null}');
    expect(page).toContain('fallback={<DiscoverLoadingScreen tab={tab} />}');
    expect(page).not.toContain('fallback={null}');
  });
});
