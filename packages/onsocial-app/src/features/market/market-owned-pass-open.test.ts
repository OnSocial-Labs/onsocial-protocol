import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const owned = readFileSync(join(here, 'market-owned-row.tsx'), 'utf8');
const holding = readFileSync(
  join(here, '../collectibles/collectibles-holding-row.tsx'),
  'utf8'
);
const panel = readFileSync(
  join(here, '../scarces/collection-page-panel.tsx'),
  'utf8'
);

describe('Market / vault event thumb opens the drop, not ?pass=1', () => {
  it('resolves collection from the token so the thumb stays on DropPlaceLink', () => {
    expect(owned).toContain('collectionIdFromTokenId');
    expect(owned).toContain('collectionPath(passCollectionId)');
    expect(owned).toContain('opensDropPage = Boolean(dropHref)');
    expect(owned).toContain('holdingsPlayHref');
    expect(owned).not.toContain('pass: true');
    expect(holding).toContain('collectionIdFromTokenId');
    expect(holding).toContain('collectionPath(collectionId)');
    expect(holding).toContain('opensDropPage = Boolean(dropHref)');
    expect(holding).toContain('holdingsPlayHref');
  });

  it('opens a share pass deep-link in the effect turn', () => {
    expect(panel).toContain(
      'Share deep-link ?pass=1&t=… → open pass in this turn'
    );
    expect(panel).toContain('setShowPassTokenId(tokenId);\n    setShowPassOpen(true);');
  });
});

