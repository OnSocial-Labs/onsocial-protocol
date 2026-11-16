/**
 * Shared empty / status voice across App.
 *
 * Status lines (`market-page-status`, `OsAppChromePageStatus`) stay one short
 * sentence — no icon. True empties keep the existing trees
 * (`market-page-empty`, `standing-panel-empty-state`) with optional
 * `OsEmptyAction`. Do not invent a third empty layout or a universal
 * decorative glyph (no coffee-cup empties).
 */
export const emptyCopy = {
  noMatches: 'No matches.',
  noMatchesForFilters: 'No matches for these filters.',
  nothingHereYet: 'Nothing here yet.',
  nothingMovingYet: 'Nothing moving yet.',
  /** In-flow Market hint when the live board is empty but sales remain. */
  noActiveListingsSalesBelow: 'No active listings — recent sales below.',
  nothingListedYet:
    'Nothing listed yet. List a scarce from a post, or sell one you own under Yours.',
} as const;
