/**
 * App sheet stacking scale — single source of truth for GlassSheet-family
 * `zIndex`. Values preserve the historical bands; add new sheets to the band
 * that matches their nesting depth instead of inventing a number.
 *
 * UI-package defaults that coincide with this scale: GlassSheet 50,
 * OsGestureSheet 56, OsHugSheet / ActionDrawer 60, DISCARD_CONFIRM_Z 96.
 * The OS summon launcher sits at 46 (os-launcher.css) — below every sheet.
 */
export const SHEET_Z = {
  /** Page content drawer, under the overlay host. */
  pageDrawer: 48,
  /** Portfolio glass host / overlay pages (OsPageSheet). */
  overlayHost: 50,
  /** Facts peeking above an overlay page (joined facts). */
  overlayFacts: 52,
  /** Account / wallet drawer. */
  account: 55,
  /** Gesture + commerce sheets (Support, Endorse, Buy, Boost…). */
  gesture: 56,
  /** Facts / settings / storage peeks. */
  facts: 57,
  /** Lists + pickers (rooms, fans, activity, moods, composer). */
  list: 58,
  /** Nested above a sheet (add member, time drum, mint-cap edit). */
  nested: 60,
  /** Confirm above a nested sheet (drop start). */
  nestedConfirm: 62,
  /** Discover surfaces (DAO discover). */
  discover: 72,
  /** Board lists (leaderboard, DAO members). */
  board: 74,
  /** Task / media shells (protocol task, listen shell). */
  shell: 80,
  /** Management consoles above a shell (door staff). */
  shellManager: 88,
  /** Edit slide-overs + commerce above a shell. */
  overShell: 90,
  /** Final confirms above everything (protocol / DAO / scarce nested). */
  confirm: 110,
  /** Choice drawers nested inside a lightbox footer. */
  lightboxNested: 130,
} as const;

export type SheetZBand = keyof typeof SHEET_Z;
