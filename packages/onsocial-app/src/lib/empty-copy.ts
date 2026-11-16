/**
 * Shared empty / status voice across App.
 *
 * Catalog status uses `CatalogStatusLine` (one short sentence, no icon).
 * Chrome pages use `OsAppChromePageStatus`. True empties keep the existing
 * trees + optional `OsEmptyAction`. No third empty layout, no decorative
 * empty glyph.
 */
export const emptyCopy = {
  noMatches: 'No matches.',
  noMatchesForFilters: 'No matches for these filters.',
  lookingForMatches: 'Looking for matches…',
  nothingHereYet: 'Nothing here yet.',
  nothingMovingYet: 'Nothing moving yet.',
  /** In-flow Market hint when the live board is empty but sales remain. */
  noActiveListingsSalesBelow: 'No active listings — recent sales below.',
  nothingListedYet:
    'Nothing listed yet. List a scarce from a post, or sell one you own under Yours.',
} as const;
