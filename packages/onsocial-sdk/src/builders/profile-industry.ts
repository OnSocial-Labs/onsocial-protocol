// ---------------------------------------------------------------------------
// builders/profile-industry — freeform org line (user-curated, not a taxonomy)
// ---------------------------------------------------------------------------

/** Max stored length for `profile/industry`. Same cap as location. */
export const PROFILE_INDUSTRY_MAX = 64;

/** Trim + collapse whitespace; empty → ''. Strips control chars + caps. */
export function normalizeProfileIndustryInput(raw: string): string {
  return (
    raw
      // eslint-disable-next-line no-control-regex -- strip C0 + DEL
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, PROFILE_INDUSTRY_MAX)
  );
}

/** Live typing — allow trailing spaces while drafting; still strip + cap. */
export function sanitizeProfileIndustryDraft(raw: string): string {
  return (
    raw
      // eslint-disable-next-line no-control-regex -- strip C0 + DEL
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, PROFILE_INDUSTRY_MAX)
  );
}

/**
 * Read industry from a materialised profile.
 * Prefers reserved `industry`; falls back to legacy `extra.industry`.
 */
export function profileIndustryFromMaterialised(
  profile:
    | {
        industry?: string | null;
        extra?: Record<string, string> | null;
      }
    | null
    | undefined
): string {
  const direct = profile?.industry?.trim();
  if (direct) return normalizeProfileIndustryInput(direct);
  const legacy = profile?.extra?.industry?.trim();
  if (legacy) return normalizeProfileIndustryInput(legacy);
  return '';
}

/** Org face line: written industry, or “Organization” when empty. */
export function profileOrgLineLabel(industry?: string | null): string {
  return profileIndustryFromMaterialised({ industry }) || 'Organization';
}
