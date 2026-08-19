/** Shared topic slug for hubs, guilds (and feed hashtag shape). */

export const TOPIC_MAX_LENGTH = 32;
export const TOPIC_MAX_PER_ENTITY = 2;
export const TOPIC_SLUG_RE = /^[a-z0-9_]{1,32}$/;

/**
 * Custom (non-curated) Discover chips need this many hubs/guilds before
 * they appear — avoids one-off tag noise. Curated suggestions show at 1+.
 */
export const DISCOVER_CUSTOM_TOPIC_MIN_COUNT = 2;

/** Normalize raw input into a topic slug (no `#`). Returns null if empty/invalid. */
export function normalizeTopicSlug(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const slug = raw
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, TOPIC_MAX_LENGTH);
  if (!slug || !TOPIC_SLUG_RE.test(slug)) return null;
  return slug;
}

/**
 * Live draft typing — first letter uppercase, rest lowercase, capped.
 * Spaces allowed while typing; commit still stores a lowercase slug.
 */
export function formatTopicDraftInput(raw: string): string {
  const trimmedStart = raw.replace(/^\s+/, '');
  if (!trimmedStart) return '';
  const capped = trimmedStart.slice(0, TOPIC_MAX_LENGTH);
  return toSentenceCase(capped);
}

/** First character upper, remainder lower (matches draft typing). */
export function toSentenceCase(raw: string): string {
  if (!raw) return '';
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

/** Cap + dedupe topic list; first entry is primary. */
export function normalizeTopicList(
  raw: unknown,
  max: number = TOPIC_MAX_PER_ENTITY
): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const slug = normalizeTopicSlug(item);
    if (!slug || out.includes(slug)) continue;
    out.push(slug);
    if (out.length >= max) break;
  }
  return out;
}

export function topicsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((topic, index) => topic === b[index]);
}

/**
 * Display label — known suggestions use curated labels; customs use
 * Sentence case (same as draft typing), e.g. `live_music` → `Live music`.
 */
export function topicLabel(
  slug: string | null | undefined,
  suggestions?: ReadonlyArray<{ id: string; label: string }>
): string | null {
  if (!slug) return null;
  const known = suggestions?.find((entry) => entry.id === slug);
  if (known) return known.label;
  const words = slug.split('_').filter(Boolean).join(' ');
  return words ? toSentenceCase(words) : null;
}

export type DiscoverTopicFilter = 'all' | string;

export interface DiscoverTopicFilterOptions {
  /** Slug ids treated as curated (show at count >= 1). */
  curatedIds?: ReadonlySet<string>;
  /** Min count for non-curated customs (default {@link DISCOVER_CUSTOM_TOPIC_MIN_COUNT}). */
  customMinCount?: number;
}

/**
 * Discover browse chips: All + used topics/categories.
 * Curated suggestions appear at 1+ use; customs need customMinCount.
 */
export function discoverTopicFiltersFromCounts(
  categoryCounts: ReadonlyMap<string, number> | Record<string, number>,
  suggestions?: ReadonlyArray<{ id: string; label: string }>,
  opts: DiscoverTopicFilterOptions = {}
): ReadonlyArray<{ id: DiscoverTopicFilter; label: string }> {
  const counts =
    categoryCounts instanceof Map
      ? categoryCounts
      : new Map(Object.entries(categoryCounts));

  const curatedIds =
    opts.curatedIds ??
    new Set((suggestions ?? []).map((entry) => entry.id));
  const customMin = opts.customMinCount ?? DISCOVER_CUSTOM_TOPIC_MIN_COUNT;

  const used = [...counts.entries()]
    .filter(([id, count]) => {
      if (count <= 0) return false;
      if (curatedIds.has(id)) return count >= 1;
      return count >= customMin;
    })
    .map(([id, count]) => ({
      id: id as DiscoverTopicFilter,
      label: topicLabel(id, suggestions) ?? id,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return [
    { id: 'all', label: 'All' },
    ...used.map(({ id, label }) => ({ id, label })),
  ];
}

/** Count primary topics/categories from a directory sample. */
export function countPrimaryTopics(
  rows: ReadonlyArray<{ topic: string | null | undefined }>
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const slug = row.topic?.trim();
    if (!slug) continue;
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return counts;
}
