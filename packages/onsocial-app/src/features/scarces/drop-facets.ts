/**
 * Controlled discovery facets for drops — stamped into NEP-177 `extra.facets`.
 * Medium (`extra.kind`) is primary; facets are secondary browse chips.
 * Closed vocab per medium (no free-type) so market filters stay reliable.
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

export const ART_STYLE_SUGGESTIONS = [
  { id: 'digital', label: 'Digital' },
  { id: 'illustration', label: 'Illustration' },
  { id: 'photo', label: 'Photo' },
  { id: 'generative', label: 'Generative' },
  { id: '3d', label: '3D' },
  { id: 'paint', label: 'Paint' },
  { id: 'print', label: 'Print' },
  { id: 'collage', label: 'Collage' },
  { id: 'abstract', label: 'Abstract' },
  { id: 'figurative', label: 'Figurative' },
  { id: 'pixel', label: 'Pixel' },
  { id: 'animation', label: 'Animation' },
] as const;

export const TICKET_EVENT_SUGGESTIONS = [
  { id: 'music', label: 'Music' },
  { id: 'nightlife', label: 'Nightlife' },
  { id: 'sports', label: 'Sports' },
  { id: 'theatre', label: 'Theatre' },
  { id: 'comedy', label: 'Comedy' },
  { id: 'conference', label: 'Conference' },
  { id: 'festival', label: 'Festival' },
  { id: 'workshop', label: 'Workshop' },
  { id: 'film', label: 'Film' },
  { id: 'community', label: 'Community' },
] as const;

export const COUPON_OFFER_SUGGESTIONS = [
  { id: 'discount', label: 'Discount' },
  { id: 'freebie', label: 'Freebie' },
  { id: 'merch', label: 'Merch' },
  { id: 'food', label: 'Food & drink' },
  { id: 'experience', label: 'Experience' },
  { id: 'digital', label: 'Digital' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'bundle', label: 'Bundle' },
] as const;

export const MEMBERSHIP_ACCESS_SUGGESTIONS = [
  { id: 'community', label: 'Community' },
  { id: 'patron', label: 'Patron' },
  { id: 'season', label: 'Season' },
  { id: 'vip', label: 'VIP' },
  { id: 'club', label: 'Club' },
  { id: 'education', label: 'Education' },
  { id: 'creator', label: 'Creator' },
  { id: 'dao', label: 'DAO' },
] as const;

/** Light theme set for Custom drops — not a free-tag dump. */
export const CUSTOM_THEME_SUGGESTIONS = [
  { id: 'collectible', label: 'Collectible' },
  { id: 'utility', label: 'Utility' },
  { id: 'access', label: 'Access' },
  { id: 'reward', label: 'Reward' },
  { id: 'identity', label: 'Identity' },
  { id: 'experiment', label: 'Experiment' },
] as const;

const MUSIC_IDS = new Set(MUSIC_GENRE_SUGGESTIONS.map((e) => e.id));
const WRITING_IDS = new Set(WRITING_SUBJECT_SUGGESTIONS.map((e) => e.id));
const ART_IDS = new Set(ART_STYLE_SUGGESTIONS.map((e) => e.id));
const TICKET_IDS = new Set(TICKET_EVENT_SUGGESTIONS.map((e) => e.id));
const COUPON_IDS = new Set(COUPON_OFFER_SUGGESTIONS.map((e) => e.id));
const MEMBERSHIP_IDS = new Set(MEMBERSHIP_ACCESS_SUGGESTIONS.map((e) => e.id));
const CUSTOM_IDS = new Set(CUSTOM_THEME_SUGGESTIONS.map((e) => e.id));

const ALL_SUGGESTIONS = [
  ...MUSIC_GENRE_SUGGESTIONS,
  ...WRITING_SUBJECT_SUGGESTIONS,
  ...ART_STYLE_SUGGESTIONS,
  ...TICKET_EVENT_SUGGESTIONS,
  ...COUPON_OFFER_SUGGESTIONS,
  ...MEMBERSHIP_ACCESS_SUGGESTIONS,
  ...CUSTOM_THEME_SUGGESTIONS,
] as const;

export type DropFacetMedium =
  | 'audio'
  | 'writing'
  | 'art'
  | 'ticket'
  | 'coupon'
  | 'membership'
  | 'custom';

export function isDropFacetMedium(
  medium: string | null | undefined
): medium is DropFacetMedium {
  return normalizeDropFacetMedium(medium) != null;
}

/** Normalize filter/create medium keys (`music` → `audio`). */
export function normalizeDropFacetMedium(
  medium: string | null | undefined
): DropFacetMedium | null {
  const key = (medium ?? '').trim().toLowerCase();
  if (key === 'music' || key === 'audio') return 'audio';
  if (
    key === 'writing' ||
    key === 'art' ||
    key === 'ticket' ||
    key === 'coupon' ||
    key === 'membership' ||
    key === 'custom'
  ) {
    return key;
  }
  return null;
}

export function dropFacetSuggestionsForMedium(
  medium: DropFacetMedium | string | null | undefined
): ReadonlyArray<{ id: string; label: string }> {
  const key = normalizeDropFacetMedium(medium);
  switch (key) {
    case 'audio':
      return MUSIC_GENRE_SUGGESTIONS;
    case 'writing':
      return WRITING_SUBJECT_SUGGESTIONS;
    case 'art':
      return ART_STYLE_SUGGESTIONS;
    case 'ticket':
      return TICKET_EVENT_SUGGESTIONS;
    case 'coupon':
      return COUPON_OFFER_SUGGESTIONS;
    case 'membership':
      return MEMBERSHIP_ACCESS_SUGGESTIONS;
    case 'custom':
      return CUSTOM_THEME_SUGGESTIONS;
    default:
      return [];
  }
}

export function dropFacetsAllowedForMedium(
  medium: DropFacetMedium | string | null | undefined
): Set<string> {
  const key = normalizeDropFacetMedium(medium);
  switch (key) {
    case 'audio':
      return MUSIC_IDS;
    case 'writing':
      return WRITING_IDS;
    case 'art':
      return ART_IDS;
    case 'ticket':
      return TICKET_IDS;
    case 'coupon':
      return COUPON_IDS;
    case 'membership':
      return MEMBERSHIP_IDS;
    case 'custom':
      return CUSTOM_IDS;
    default:
      return new Set();
  }
}

/** Chip-group label on create + market rails. */
export function dropFacetFieldLabel(
  medium: DropFacetMedium | string | null | undefined
): string {
  const key = normalizeDropFacetMedium(medium);
  switch (key) {
    case 'audio':
      return 'Genre';
    case 'writing':
      return 'Subject';
    case 'art':
      return 'Style';
    case 'ticket':
      return 'Event';
    case 'coupon':
      return 'Offer';
    case 'membership':
      return 'Access';
    case 'custom':
      return 'Theme';
    default:
      return 'Category';
  }
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
  const normalized = normalizeDropFacetMedium(medium);
  if (normalized) return normalizeDropFacets(extra.facets, normalized);
  // Untyped / legacy custom drops (no kind): accept Theme facets only.
  return normalizeDropFacets(extra.facets, 'custom');
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
