import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const screen = readFileSync(
  join(here, 'launcher-home-loading-screen.tsx'),
  'utf8'
);
const mine = readFileSync(join(here, 'launcher-home-section.tsx'), 'utf8');

describe('launcher home Structure→Paint', () => {
  it('exposes a shared launcher cold shell for index Suspense (daos)', () => {
    expect(screen).toContain('LauncherMineRailSkeleton');
    expect(screen).toContain('LAUNCHER_HOME_PAGE_CLASS');
  });

  it('soft-appears mine rail after skeleton', () => {
    expect(mine).toContain('OsPageBodyAppear');
    expect(mine).toMatch(/if \(loading\)/);
  });
});
