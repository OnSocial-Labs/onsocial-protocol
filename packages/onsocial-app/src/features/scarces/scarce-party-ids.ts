import { accountIdsEqual } from '@/lib/account-match';

export interface ScarcePartyIds {
  artistId: string | null;
  showDistinctSeller: boolean;
  artistPending: boolean;
}

/**
 * Author vs seller for commerce sheets.
 * Never paint the seller as Author while the mint creator is still loading —
 * that swap (seller → artist) is the album resale flash.
 */
export function resolveScarcePartyIds(input: {
  sellerId: string | null | undefined;
  knownArtistId: string | null | undefined;
  hydratedArtistId: string | null | undefined;
  artistReady: boolean;
}): ScarcePartyIds {
  const seller = input.sellerId?.trim() || null;
  const known = input.knownArtistId?.trim() || null;
  if (known) {
    return {
      artistId: known,
      showDistinctSeller: Boolean(seller && !accountIdsEqual(seller, known)),
      artistPending: false,
    };
  }
  if (!input.artistReady) {
    return {
      artistId: null,
      showDistinctSeller: false,
      artistPending: true,
    };
  }
  const artist = input.hydratedArtistId?.trim() || seller;
  return {
    artistId: artist,
    showDistinctSeller: Boolean(
      seller && artist && !accountIdsEqual(seller, artist)
    ),
    artistPending: false,
  };
}
