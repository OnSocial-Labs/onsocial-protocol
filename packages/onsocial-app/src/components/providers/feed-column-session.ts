/**
 * The feed column under an open place screen. The session host stays live
 * so the phone card (the portal) is not covered. The column itself pauses.
 */
export function feedColumnSession(placeDepth: number): 'covered' | null {
  return placeDepth > 0 ? 'covered' : null;
}
