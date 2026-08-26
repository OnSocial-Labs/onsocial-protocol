/**
 * Scarce overlay stacking — keep listen under commerce, nest above commerce.
 *
 * 56  default GlassSheet
 * 80  listen / read / thought / feed photo enlarge (OsSlideOverScreen)
 * 90  list / buy / bid when opened over the player shell
 * 110 art zoom + option drawers nested from commerce
 */
export const SCARCE_Z = {
  sheet: 56,
  listenShell: 80,
  commerceOverListen: 90,
  nestedOverCommerce: 110,
} as const;

/** Nested choice / details / royalty sheets above a parent commerce sheet. */
export function scarceNestZIndex(parentZIndex: number): number {
  return Math.max(parentZIndex + 20, SCARCE_Z.nestedOverCommerce);
}
