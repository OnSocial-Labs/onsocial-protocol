import { describe, expect, it } from 'vitest';
import {
  offerListClock,
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

describe('offerListClock', () => {
  const now = Date.parse('2026-06-15T12:00:00.000Z');

  it('uses a bare stamp unless the offer expires', () => {
    expect(
      offerListClock({ createdAtNs: (now - 5 * 60_000) * 1_000_000 }, now)
        ?.label
    ).toBe('5m');
    expect(
      offerListClock(
        {
          createdAtNs: (now - 5 * 60_000) * 1_000_000,
          expiresAtNs: (now + 2 * 86_400_000) * 1_000_000,
        },
        now
      )?.label
    ).toBe('Ends 2d');
    expect(
      offerListClock({ createdAtNs: 0, expiresAtNs: null }, now)
    ).toBeNull();
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
