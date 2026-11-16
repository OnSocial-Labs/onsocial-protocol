import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const screen = readFileSync(join(here, 'events-loading-screen.tsx'), 'utf8');
const panel = readFileSync(join(here, 'events-page-panel.tsx'), 'utf8');

describe('events Structure→Paint', () => {
  it('exposes a route loading shell matching catalog bones', () => {
    expect(screen).toContain("'use client'");
    expect(screen).toContain('MarketListSkeleton');
    expect(screen).toContain('variant="drops"');
    expect(screen).toContain('DROPS_INDEX_PAGE_CLASS');
  });

  it('soft-appears the settled catalog after cold skeleton', () => {
    expect(panel).toContain('OsPageBodyAppear');
    expect(panel).toContain('catalogPending');
  });
});
