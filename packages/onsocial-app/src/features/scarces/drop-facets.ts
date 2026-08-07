/**
 * Controlled discovery facets for drops — stamped into NEP-177 `extra.facets`.
 * Medium (`extra.kind`) stays the primary taxonomy; facets are secondary chips
 * (music genres, writing subjects). Closed vocab so market filters stay clean.
 */

import { topicLabel } from '@/lib/topic-slug';

/** Max facets a creator can stamp on one drop. */
export const DROP_MAX_FACETS = 3;

export const MUSIC_GENRE_SUGGESTIONS = [
  { id: 'electronic', label: 'Electronic' },
  { id: 'hip-hop', label: 'Hip-hop' },
  { id: 'indie', label: 'Indie' },
  { id: 'jazz', label: 'Jazz' },
  { id: 'metal', label: 'Metal' },
  { id: 'pop', label: 'Pop' },
  { id: 'r-b', label: 'R&B' },
  { id: 'rock', label: 'Rock' },
  { id: 'blues', label: 'Blues' },
  { id: 'folk', label: 'Folk' },
  { id: 'classical', label: 'Classical' },
  { id: 'ambient', label: 'Ambient' },
  { id: 'punk', label: 'Punk' },
  { id: 'soul', label: 'Soul' },
  { id: 'world', label: 'World' },
] as const;

export const WRITING_SUBJECT_SUGGESTIONS = [
  { id: 'fiction', label: 'Fiction' },
  { id: 'nonfiction', label: 'Nonfiction' },
  { id: 'poetry', label: 'Poetry' },
  { id: 'essay', label: 'Essay' },
  { id: 'memoir', label: 'Memoir' },
  { id: 'scifi', label: 'Sci-fi' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'thriller', label: 'Thriller' },
  { id: 'romance', label: 'Romance' },
  { id: 'history', label: 'History' },
  { id: 'philosophy', label: 'Philosophy' },
  { id: 'self-help', label: 'Self-help' },
  { id: 'children', label: 'Children' },
  { id: 'comics', label: 'Comics' },
] as const;

const MUSIC_IDS = new Set(MUSIC_GENRE_SUGGESTIONS.map((entry) => entry.id));
const WRITING_IDS = new Set(
  WRITING_SUBJECT_SUGGESTIONS.map((entry) => entry.id)
);
const ALL_SUGGESTIONS = [
  ...MUSIC_GENRE_SUGGESTIONS,
  ...WRITING_SUBJECT_SUGGESTIONS,
] as const;

export type DropFacetMedium = 'audio' | 'writing';

export function dropFacetSuggestionsForMedium(
  medium: DropFacetMedium | string | null | undefined
): ReadonlyArray<{ id: string; label: string }> {
  const key = (medium ?? '').trim().toLowerCase();
  if (key === 'audio' || key === 'music') return MUSIC_GENRE_SUGGESTIONS;
  if (key === 'writing') return WRITING_SUBJECT_SUGGESTIONS;
  return [];
}

export function dropFacetsAllowedForMedium(
  medium: DropFacetMedium | string | null | undefined
): Set<string> {
  const key = (medium ?? '').trim().toLowerCase();
  if (key === 'audio' || key === 'music') return MUSIC_IDS;
  if (key === 'writing') return WRITING_IDS;
  return new Set();
}

/** Keep only known slugs for the medium, capped. */
export function normalizeDropFacets(
  raw: unknown,
  medium: DropFacetMedium | string | null | undefined
): string[] {
  const allowed = dropFacetsAllowedForMedium(medium);
  if (allowed.size === 0 || !Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    // Closed vocab uses hyphens (`hip-hop`); accept underscore input too.
    const key = item.trim().toLowerCase().replace(/_/g, '-');
    if (!allowed.has(key) || out.includes(key)) continue;
    out.push(key);
    if (out.length >= DROP_MAX_FACETS) break;
  }
  return out;
}

export function parseDropFacets(
  extra: Record<string, unknown> | null | undefined,
  medium: string | null | undefined
): string[] {
  if (!extra) return [];
  return normalizeDropFacets(extra.facets, medium);
}

export function dropFacetLabel(slug: string | null | undefined): string | null {
  return topicLabel(slug, ALL_SUGGESTIONS);
}

export function dropFacetsLabel(facets: string[]): string | null {
  if (facets.length === 0) return null;
  return facets
    .map((slug) => dropFacetLabel(slug) ?? slug)
    .filter(Boolean)
    .join(' · ');
}

/** Fields to merge into create `extra` when facets are set. */
export function dropFacetsExtraFields(
  facets: string[],
  medium: DropFacetMedium | string | null | undefined
): { facets?: string[] } {
  const next = normalizeDropFacets(facets, medium);
  return next.length > 0 ? { facets: next } : {};
}

export function parseAudioFormat(
  raw: unknown
): 'single' | 'album' | 'podcast' | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase();
  if (key === 'single' || key === 'album' || key === 'podcast') return key;
  return null;
}

export function inferAudioFormatFromPlayableCount(
  count: number
): 'single' | 'album' | null {
  if (count === 1) return 'single';
  if (count >= 2) return 'album';
  return null;
}
