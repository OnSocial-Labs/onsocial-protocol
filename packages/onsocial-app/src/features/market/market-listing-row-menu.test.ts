import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { listingOverflowActions } from '@/features/market/market-listing-row-menu';

const menuSrc = join(
  dirname(fileURLToPath(import.meta.url)),
  'market-listing-row-menu.tsx'
);

describe('listingOverflowActions', () => {
  it('offers History, Share, and Share to post on an edition', () => {
    expect(
      listingOverflowActions({
        tokenId: 'drop-1:2',
        sharePath: '/drop/drop-1',
      })
    ).toEqual(['history', 'share', 'share-to-post']);
  });

  it('keeps Share and Share to post on a primary that is not an edition yet', () => {
    expect(
      listingOverflowActions({
        collectionId: 'drop-1',
        sharePath: '/drop/drop-1',
      })
    ).toEqual(['share', 'share-to-post']);
  });

  it('offers only Share when the listing has a post and no drop or token', () => {
    expect(
      listingOverflowActions({
        sharePath: '/alice.near/post/1',
      })
    ).toEqual(['share']);
  });
});

describe('listing overflow menu', () => {
  it('keeps History in its own section above Share', () => {
    const source = readFileSync(menuSrc, 'utf8');
    const historyAt = source.indexOf("section: 'History'");
    const listingAt = source.indexOf("section: 'Listing'");
    expect(historyAt).toBeGreaterThan(-1);
    expect(listingAt).toBeGreaterThan(historyAt);
    expect(source).toContain("label: 'Share'");
    expect(source).toContain("label: 'Share to post'");
    expect(source).toContain('aria-label={`More for ${title}`}');
  });
});
