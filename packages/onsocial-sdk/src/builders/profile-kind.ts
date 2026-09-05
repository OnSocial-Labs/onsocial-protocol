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

/** Person editor chips — DAO is heuristic / workspace, not a profile pick. */
export const PROFILE_FACE_KIND_OPTIONS: ReadonlyArray<{
  value: Exclude<ProfileKind, 'dao'>;
  label: string;
}> = [
  { value: 'person', label: 'Person' },
  { value: 'org', label: 'Organization' },
];

/** Stored kind for the person/org editor. `dao` is not a self-serve pick. */
export function editorFaceKind(
  kind?: ProfileKind | null
): Exclude<ProfileKind, 'dao'> {
  return parseProfileKind(kind) === 'org' ? 'org' : 'person';
}

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
 * Face presentation. Protocol / catalog DAO (`fallbackDao`) always wins —
 * stored kind cannot override a DAO workspace. Everyone else is person
 * unless they picked `org`.
 */
export function resolveDisplayProfileKind(
  kind?: ProfileKind | null,
  fallbackDao = false
): ProfileKind {
  if (fallbackDao) return 'dao';
  return parseProfileKind(kind) === 'org' ? 'org' : 'person';
}

/**
 * Three distinct face geometries:
 * person / omit → circle, org → squircle, dao → square-ish.
 */
export function profileAvatarShapeFromKind(
  kind?: ProfileKind | null
): ProfileAvatarShape {
  if (kind === 'org') return 'squircle';
  if (kind === 'dao') return 'square';
  return 'circle';
}

/** Shape for a face. DAO workspace always squares; others follow person/org. */
export function profileAvatarShapeForFace(
  kind?: ProfileKind | null,
  fallbackDao = false
): ProfileAvatarShape {
  return profileAvatarShapeFromKind(
    resolveDisplayProfileKind(kind, fallbackDao)
  );
}

/** Quiet face copy. Person / omit → no label. Org uses the location-style line. */
export function profileKindFaceLabel(kind?: ProfileKind | null): string | null {
  if (kind === 'org') return 'Organization';
  if (kind === 'dao') return 'DAO';
  return null;
}

/** Crafts are a person About line. Org and DAO keep leftover tags off About. */
export function profileKindShowsCrafts(kind?: ProfileKind | null): boolean {
  return kind !== 'org' && kind !== 'dao';
}

/** Industry is a house fact — org / DAO face, echoed under the About name. */
export function profileKindShowsIndustry(kind?: ProfileKind | null): boolean {
  return kind === 'org' || kind === 'dao';
}
