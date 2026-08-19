/** Shared topic slug for hubs, guilds (and feed hashtag shape). */

export const TOPIC_MAX_LENGTH = 32;
export const TOPIC_MAX_PER_ENTITY = 2;
export const TOPIC_SLUG_RE = /^[a-z0-9_]{1,32}$/;

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
  const first = capped.charAt(0).toUpperCase();
  const rest = capped.slice(1).toLowerCase();
  return `${first}${rest}`;
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

/** Display label — known suggestions stay title-case words; else prettify slug. */
export function topicLabel(
  slug: string | null | undefined,
  suggestions?: ReadonlyArray<{ id: string; label: string }>
): string | null {
  if (!slug) return null;
  const known = suggestions?.find((entry) => entry.id === slug);
  if (known) return known.label;
  return slug
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export type DiscoverTopicFilter = 'all' | string;

/**
 * Discover browse chips: All + every used topic/category (curated or custom),
 * sorted by count. Empty ones omitted.
 */
export function discoverTopicFiltersFromCounts(
  categoryCounts: ReadonlyMap<string, number> | Record<string, number>,
  suggestions?: ReadonlyArray<{ id: string; label: string }>
): ReadonlyArray<{ id: DiscoverTopicFilter; label: string }> {
  const counts =
    categoryCounts instanceof Map
      ? categoryCounts
      : new Map(Object.entries(categoryCounts));

  const used = [...counts.entries()]
    .filter(([, count]) => count > 0)
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
