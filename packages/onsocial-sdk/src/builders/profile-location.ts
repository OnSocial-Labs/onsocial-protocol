// ---------------------------------------------------------------------------
// builders/profile-location — coarse public “based in” (city / region)
// ---------------------------------------------------------------------------

/** Max stored length for `profile/location`. Not GPS. */
export const PROFILE_LOCATION_MAX = 64;

/** Trim + collapse whitespace; empty → ''. Strips control chars + caps. */
export function normalizeProfileLocationInput(raw: string): string {
  return (
    raw
      // eslint-disable-next-line no-control-regex -- strip C0 + DEL
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, PROFILE_LOCATION_MAX)
  );
}

/** Live typing — allow trailing spaces while drafting; still strip + cap. */
export function sanitizeProfileLocationDraft(raw: string): string {
  return (
    raw
      // eslint-disable-next-line no-control-regex -- strip C0 + DEL
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, PROFILE_LOCATION_MAX)
  );
}

/**
 * Read coarse location from a materialised profile.
 * Prefers reserved `location`; falls back to legacy `extra.location`.
 */
export function profileLocationFromMaterialised(
  profile:
    | {
        location?: string | null;
        extra?: Record<string, string> | null;
      }
    | null
    | undefined
): string {
  const direct = profile?.location?.trim();
  if (direct) return normalizeProfileLocationInput(direct);
  const legacy = profile?.extra?.location?.trim();
  if (legacy) return normalizeProfileLocationInput(legacy);
  return '';
}
