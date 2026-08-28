import { SHEET_Z } from '@/lib/sheet-z';

/**
 * Scarce overlay stacking — keep listen under commerce, nest above commerce.
 * Bands come from the shared app scale (@/lib/sheet-z):
 *
 * 56  default GlassSheet
 * 80  listen / read / thought / feed photo enlarge (OsSlideOverScreen)
 * 90  list / buy / bid when opened over the player shell
 * 110 art zoom + option drawers nested from commerce
 */
export const SCARCE_Z = {
  sheet: SHEET_Z.gesture,
  listenShell: SHEET_Z.shell,
  commerceOverListen: SHEET_Z.overShell,
  nestedOverCommerce: SHEET_Z.confirm,
} as const;

/** Nested choice / details / royalty sheets above a parent commerce sheet. */
export function scarceNestZIndex(parentZIndex: number): number {
  return Math.max(parentZIndex + 20, SCARCE_Z.nestedOverCommerce);
}
