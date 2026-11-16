import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const screen = readFileSync(join(here, 'create-page-loading-screen.tsx'), 'utf8');
const appSrc = join(here, '../..');

describe('create page Structure→Paint', () => {
  it('exposes a shared create chrome shell with form bones', () => {
    expect(screen).toContain("'use client'");
    expect(screen).toContain('osCreatePageClassName');
    expect(screen).toContain('guild-loading-lines');
  });

  it('is wired on guild/dao/hub/drop create routes', () => {
    for (const relative of [
      'app/(app)/groups/create/loading.tsx',
      'app/(app)/daos/create/loading.tsx',
      'app/(app)/apps/create/loading.tsx',
      'app/(app)/drops/create/loading.tsx',
    ]) {
      const source = readFileSync(join(appSrc, relative), 'utf8');
      expect(source, relative).toContain('CreatePageLoadingScreen');
    }
  });
});
