// ---------------------------------------------------------------------------
// builders/profile-kind — optional profile/kind (person | org | dao)
// ---------------------------------------------------------------------------

import { PROFILE_KINDS, type ProfileKind } from '../schema/v1.js';

export type { ProfileKind };
export { PROFILE_KINDS };

/** Avatar geometry implied by `profile/kind`. Unknown kind → circle. */
export type ProfileAvatarShape = 'circle' | 'squircle' | 'square';

export const PROFILE_KIND_OPTIONS: ReadonlyArray<{
  value: ProfileKind;
  label: string;
}> = [
  { value: 'person', label: 'Person' },
  { value: 'org', label: 'Organization' },
  { value: 'dao', label: 'DAO' },
];

/** Parse a stored / editor value. Invalid or empty → undefined. */
export function parseProfileKind(raw: unknown): ProfileKind | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim().toLowerCase();
  return PROFILE_KINDS.includes(value as ProfileKind)
    ? (value as ProfileKind)
    : undefined;
}

/**
 * Editor / write input. `null` / `''` / invalid → `null` (tombstone).
 * Valid kinds are returned as-is.
 */
export function normalizeProfileKindInput(raw: unknown): ProfileKind | null {
  return parseProfileKind(raw) ?? null;
}

/**
 * Read kind from a materialised profile.
 * Prefers reserved `kind`; falls back to legacy `extra.kind`.
 */
export function profileKindFromMaterialised(
  profile:
    | {
        kind?: string | null;
        extra?: Record<string, string> | null;
      }
    | null
    | undefined
): ProfileKind | undefined {
  return (
    parseProfileKind(profile?.kind) ?? parseProfileKind(profile?.extra?.kind)
  );
}

/**
 * Face presentation: omitted kind is an individual unless a DAO heuristic
 * fallback is supplied (legacy DAO accounts without `profile/kind`).
 */
export function resolveDisplayProfileKind(
  kind?: ProfileKind | null,
  fallbackDao = false
): ProfileKind {
  const parsed = parseProfileKind(kind);
  if (parsed) return parsed;
  return fallbackDao ? 'dao' : 'person';
}

export function profileAvatarShapeFromKind(
  kind?: ProfileKind | null
): ProfileAvatarShape {
  if (kind === 'org') return 'squircle';
  if (kind === 'dao') return 'square';
  return 'circle';
}

/** Quiet face copy. Person / omit → no label. Org uses the location-style line. */
export function profileKindFaceLabel(kind?: ProfileKind | null): string | null {
  if (kind === 'org') return 'Organization';
  if (kind === 'dao') return 'DAO';
  return null;
}
