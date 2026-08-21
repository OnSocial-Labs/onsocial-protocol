/** Coarse public profile “based in” — city/region text, not GPS. */

export const PROFILE_LOCATION_MAX = 64;

/** Trim + collapse whitespace; empty → ''. Rejects control chars. */
export function normalizeProfileLocationInput(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PROFILE_LOCATION_MAX);
}

/** Live typing — allow spaces while drafting; still strip controls + cap. */
export function sanitizeProfileLocationDraft(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, PROFILE_LOCATION_MAX);
}

export function profileLocationFromMaterialised(profile: {
  location?: string | null;
  extra?: Record<string, string> | null;
} | null | undefined): string {
  const direct = profile?.location?.trim();
  if (direct) return normalizeProfileLocationInput(direct);
  const legacy = profile?.extra?.location?.trim();
  if (legacy) return normalizeProfileLocationInput(legacy);
  return '';
}
