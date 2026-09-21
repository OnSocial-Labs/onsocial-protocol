import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  hasPageActivationData,
  publicPageNeedsExistsProbe,
} from '@/lib/page-data';

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'page-data.ts'),
  'utf8'
);

describe('publicPageNeedsExistsProbe', () => {
  it('skips exists for DAO orgs even when the indexer is empty', () => {
    expect(
      publicPageNeedsExistsProbe({
        isDao: true,
        hasShell: false,
        activated: false,
      })
    ).toBe(false);
  });

  it('skips exists when the indexer already has a shell', () => {
    expect(
      publicPageNeedsExistsProbe({
        isDao: false,
        hasShell: true,
        activated: false,
      })
    ).toBe(false);
  });

  it('skips exists when page config already activates the face', () => {
    expect(
      publicPageNeedsExistsProbe({
        isDao: false,
        hasShell: false,
        activated: true,
      })
    ).toBe(false);
  });

  it('probes exists only for empty non-DAO accounts', () => {
    expect(
      publicPageNeedsExistsProbe({
        isDao: false,
        hasShell: false,
        activated: false,
      })
    ).toBe(true);
  });
});

describe('hasPageActivationData', () => {
  it('treats a named shell as activated without page config', () => {
    expect(
      hasPageActivationData(
        { name: 'Ada', bio: null, avatarUrl: null, links: null, tags: [] },
        {}
      )
    ).toBe(true);
  });

  it('treats page config as activated without a shell', () => {
    expect(hasPageActivationData(null, { tagline: 'Hello' })).toBe(true);
  });

  it('stays dormant when both shell and config are empty', () => {
    expect(
      hasPageActivationData(
        { name: null, bio: null, avatarUrl: null, links: null, tags: [] },
        {}
      )
    ).toBe(false);
  });
});

describe('fetchPublicPageDataFromIndexer', () => {
  it('shares loadProfileShell and defers exists until the indexer is empty', () => {
    expect(src).toContain('loadProfileShell');
    expect(src).toContain('publicPageNeedsExistsProbe');
    expect(src).toContain('fetchAccountExists');
    expect(src).not.toContain('os.profiles.get');
    expect(src).not.toMatch(/Promise\.all\(\[\s*fetchAccountExists/);
  });
});
