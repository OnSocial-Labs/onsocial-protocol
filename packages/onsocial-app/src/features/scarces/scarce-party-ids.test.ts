import { describe, expect, it } from 'vitest';
import { resolveScarcePartyIds } from '@/features/scarces/scarce-party-ids';

describe('resolveScarcePartyIds', () => {
  it('uses a known mint creator immediately', () => {
    expect(
      resolveScarcePartyIds({
        sellerId: 'greenghost.onsocial.testnet',
        knownArtistId: 'berrysamba.testnet',
        hydratedArtistId: null,
        artistReady: false,
      })
    ).toEqual({
      artistId: 'berrysamba.testnet',
      showDistinctSeller: true,
      artistPending: false,
    });
  });

  it('does not paint the seller as Author while creator hydrate is pending', () => {
    expect(
      resolveScarcePartyIds({
        sellerId: 'greenghost.onsocial.testnet',
        knownArtistId: null,
        hydratedArtistId: null,
        artistReady: false,
      })
    ).toEqual({
      artistId: null,
      showDistinctSeller: false,
      artistPending: true,
    });
  });

  it('shows Author + Seller after hydrate when they differ', () => {
    expect(
      resolveScarcePartyIds({
        sellerId: 'greenghost.onsocial.testnet',
        knownArtistId: null,
        hydratedArtistId: 'berrysamba.testnet',
        artistReady: true,
      })
    ).toEqual({
      artistId: 'berrysamba.testnet',
      showDistinctSeller: true,
      artistPending: false,
    });
  });

  it('falls back to seller as Author only after hydrate when no creator', () => {
    expect(
      resolveScarcePartyIds({
        sellerId: 'greenghost.onsocial.testnet',
        knownArtistId: null,
        hydratedArtistId: null,
        artistReady: true,
      })
    ).toEqual({
      artistId: 'greenghost.onsocial.testnet',
      showDistinctSeller: false,
      artistPending: false,
    });
  });
});
