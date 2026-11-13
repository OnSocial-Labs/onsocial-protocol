/** Temporary. Remove with the viewport debug overlay before merge. */
export const VIEWPORT_DEBUG_STORAGE_KEY = 'onsocial.viewport-debug';

/**
 * `?viewport-debug=1` turns the readout on and stores it for this tab.
 * `?viewport-debug=0` turns it off. Any other visit keeps the stored choice.
 */
export function resolveViewportDebug(
  flag: string | null,
  stored: string | null
): { enabled: boolean; persist: '1' | '0' | null } {
  if (flag === '1') return { enabled: true, persist: '1' };
  if (flag === '0') return { enabled: false, persist: '0' };
  return { enabled: stored === '1', persist: null };
}
