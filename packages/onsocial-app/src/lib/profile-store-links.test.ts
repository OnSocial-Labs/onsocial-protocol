import { describe, expect, it } from 'vitest';
import {
  STORE_LISTING_BADGE,
  storeListingHref,
} from '@/lib/profile-store-links';

describe('STORE_LISTING_BADGE', () => {
  it('uses social labels instead of marketplace jargon', () => {
    expect(STORE_LISTING_BADGE.native).toBe('For sale');
    expect(STORE_LISTING_BADGE.lazy).toBe('Edition');
    expect(STORE_LISTING_BADGE.auction).toBe('Auction');
  });
});

describe('storeListingHref', () => {
  it('prefers the source post over the creator shop', () => {
    expect(
      storeListingHref(
        { sourcePostPath: 'alice.near/post/42', tokenId: 'drop:1' },
        'alice.near'
      )
    ).toBe('/@alice.near/posts/42');
  });

  it('opens the drop page when there is no source post', () => {
    expect(storeListingHref({ tokenId: 'album:1' }, 'alice.near')).toBe(
      '/collection/album'
    );
  });

  it('falls back to the creator shop for post scarces without a path', () => {
    expect(storeListingHref({ tokenId: 's:abc' }, 'alice.near')).toBe(
      '/market?creator=alice.near'
    );
  });
});
