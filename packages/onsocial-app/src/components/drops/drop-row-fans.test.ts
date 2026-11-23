import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('DropRowFans roster settle', () => {
  it('loads fan ids when count soft-fills without ids — never eternal shimmer', () => {
    const source = readFileSync(join(here, 'drop-row-fans.tsx'), 'utf8');
    expect(source).toContain('loadDropFanIds(creatorId, collectionId)');
    expect(source).toContain('rosterSettled');
    expect(source).toContain('fanCount > 0 && !rosterSettled');
    expect(source).toContain('creatorId={creatorId}');
    expect(source).toContain('collectionId={collectionId}');
    // Settled with no ids falls back to text — not loading={true} forever.
    expect(source).toContain('fanCountLabel(fanCount)');
  });
});
