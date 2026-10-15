import { describe, expect, it } from 'vitest';
import { marketListingRowTarget } from '@/features/market/market-row-targets';

describe('marketListingRowTarget', () => {
  it('opens the drop even when the listing also has a post', () => {
    expect(
      marketListingRowTarget({
        collectionId: 'gate-pass',
        postHref: '/@bob.near/posts/9',
      })
    ).toEqual({ href: '/collection/gate-pass', kind: 'drop' });
  });

  it('reads the drop from an edition token', () => {
    expect(
      marketListingRowTarget({
        tokenId: 'night-drive:3',
        postHref: '/@alice.near/posts/1',
      })
    ).toEqual({ href: '/collection/night-drive', kind: 'drop' });
  });

  it('opens the post when there is no drop', () => {
    expect(
      marketListingRowTarget({
        tokenId: 's:abc',
        postHref: '/@alice.near/posts/42',
      })
    ).toEqual({ href: '/@alice.near/posts/42', kind: 'post' });
  });

  it('returns null when there is nowhere to open', () => {
    expect(marketListingRowTarget({ tokenId: 's:abc' })).toBeNull();
    expect(marketListingRowTarget({})).toBeNull();
  });
});
