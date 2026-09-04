// ---------------------------------------------------------------------------
// builders/profile-about-align — More for About essay alignment
// ---------------------------------------------------------------------------

/** Essay alignment for `profile/aboutAlign` (More under the film). */
export type ProfileAboutAlign = 'left' | 'center' | 'justify';

/** Default when unset — reading measure, live About essay. */
export const PROFILE_ABOUT_ALIGN_DEFAULT: ProfileAboutAlign = 'left';

export const PROFILE_ABOUT_ALIGN_OPTIONS = [
  'left',
  'center',
  'justify',
] as const satisfies readonly ProfileAboutAlign[];

/** Normalize unknown storage / draft → canonical align. */
export function normalizeProfileAboutAlign(raw: unknown): ProfileAboutAlign {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (value === 'center' || value === 'justify') return value;
  return PROFILE_ABOUT_ALIGN_DEFAULT;
}

/**
 * Read essay align from a materialised profile.
 * Prefers `aboutAlign`; soft-reads `extra.aboutAlign`.
 */
export function profileAboutAlignFromMaterialised(
  profile:
    | {
        aboutAlign?: string | null;
        extra?: Record<string, string> | null;
      }
    | null
    | undefined
): ProfileAboutAlign {
  const direct = profile?.aboutAlign;
  if (direct != null && String(direct).trim()) {
    return normalizeProfileAboutAlign(direct);
  }
  const extra = profile?.extra?.aboutAlign;
  if (extra != null && String(extra).trim()) {
    return normalizeProfileAboutAlign(extra);
  }
  return PROFILE_ABOUT_ALIGN_DEFAULT;
}
