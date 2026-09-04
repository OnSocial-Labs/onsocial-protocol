// ---------------------------------------------------------------------------
// builders/profile-lead — quiet About lead above the film (2nd–3rd stills)
// ---------------------------------------------------------------------------

/** Max stored length for `profile/lead` (markdown). Centered above the film. */
export const PROFILE_LEAD_MAX = 120;

/**
 * Trim + strip controls; keep newlines for markdown marks.
 * Empty → ''. Caps at {@link PROFILE_LEAD_MAX}.
 */
export function normalizeProfileLeadInput(raw: string): string {
  return (
    raw
      // eslint-disable-next-line no-control-regex -- strip C0 + DEL (keep \n \t)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
      .slice(0, PROFILE_LEAD_MAX)
  );
}

/** Live typing — allow trailing spaces / newline while drafting; still strip + cap. */
export function sanitizeProfileLeadDraft(raw: string): string {
  return (
    raw
      // eslint-disable-next-line no-control-regex -- strip C0 + DEL (keep \n \t)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .slice(0, PROFILE_LEAD_MAX)
  );
}

/**
 * Read About lead from a materialised profile.
 * Prefers `lead`; soft-reads short-lived `kicker` / `extra.*` leftovers.
 */
export function profileLeadFromMaterialised(
  profile:
    | {
        lead?: string | null;
        kicker?: string | null;
        extra?: Record<string, string> | null;
      }
    | null
    | undefined
): string {
  const direct = profile?.lead?.trim();
  if (direct) return normalizeProfileLeadInput(direct);
  const legacyLead = profile?.extra?.lead?.trim();
  if (legacyLead) return normalizeProfileLeadInput(legacyLead);
  const early = profile?.kicker?.trim();
  if (early) return normalizeProfileLeadInput(early);
  const earlyExtra = profile?.extra?.kicker?.trim();
  if (earlyExtra) return normalizeProfileLeadInput(earlyExtra);
  return '';
}
