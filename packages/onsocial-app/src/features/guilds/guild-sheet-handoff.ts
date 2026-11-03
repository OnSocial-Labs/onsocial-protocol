/**
 * Settings → rooms crossfades once. Latch that swap so clearing the handoff
 * flag does not restart the rooms sheet, and later drawers open on their own.
 */
export function latchOpenedSwap(
  open: boolean,
  handoff: boolean,
  latched: boolean
): boolean {
  if (!open) return false;
  return latched || handoff;
}
