import { describe, expect, it } from 'vitest';
import {
  offersWithoutLiveListing,
  viewerOfferCta,
  viewerOfferCtaLabel,
} from '@/features/scarces/scarce-offers';

describe('offersWithoutLiveListing', () => {
  const offer = (tokenId: string) => ({
    tokenId,
    amountYocto: '1',
    amountNear: '1',
    expiresAtNs: null,
  });

  it('keeps bids whose token is no longer listed', () => {
    expect(
      offersWithoutLiveListing(
        [offer('s:1'), offer('s:2'), offer('s:3')],
        new Set(['s:2'])
      ).map((row) => row.tokenId)
    ).toEqual(['s:1', 's:3']);
  });

  it('hides the inbox when every bid still has Buy', () => {
    expect(offersWithoutLiveListing([offer('s:1')], new Set(['s:1']))).toEqual(
      []
    );
  });
});

describe('viewerOfferCta', () => {
  it('stays unknown until the query is ready', () => {
    expect(viewerOfferCta(false, true)).toBeNull();
    expect(viewerOfferCta(false, false)).toBeNull();
  });

  it('uses Update only when an open offer is known', () => {
    expect(viewerOfferCta(true, true)).toBe('update');
    expect(viewerOfferCta(true, false)).toBe('make');
    expect(viewerOfferCtaLabel('update')).toBe('Update offer');
    expect(viewerOfferCtaLabel('make', 'buy')).toBe('Make an offer');
    expect(viewerOfferCtaLabel('make', 'offer')).toBe('Make offer');
  });
});
