import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const owned = readFileSync(join(here, 'market-owned-row.tsx'), 'utf8');
const listing = readFileSync(join(here, 'market-listing-row.tsx'), 'utf8');
const holding = readFileSync(
  join(here, '../collectibles/collectibles-holding-row.tsx'),
  'utf8'
);

describe('Edition seat on the shared meta line', () => {
  it('keeps #N on the fact / meta line, not under the title', () => {
    expect(holding).toContain('heldEditionRowMark(item.tokenId, editionCount)');
    expect(holding).not.toContain('collectibles-holding-edition');
    expect(holding).not.toContain('collectibles-holding-title-block');
    expect(owned).toContain('heldEditionMark(item.tokenId)');
    expect(listing).toContain('heldEditionMark(item.tokenId)');
    expect(listing).toContain('!isPrimaryMint && item.tokenId');
  });
});
