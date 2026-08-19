import {
  normalizeTopicList,
  normalizeTopicSlug,
  topicLabel,
} from '@/lib/topic-slug';

/**
 * Curated hub categories — aligned with mintable drop verticals.
 * One category per hub. Users may still type a custom slug.
 */
export const HUB_CATEGORY_SUGGESTIONS = [
  { id: 'music', label: 'Music' },
  { id: 'art', label: 'Art' },
  { id: 'books', label: 'Books' },
  { id: 'events', label: 'Events' },
  { id: 'community', label: 'Community' },
] as const;

export type HubCategory = string;
export type HubCategoryFilter = 'all' | string;

/** Hubs pick a single category (directory browse key). */
export const HUB_MAX_CATEGORIES = 1;

export function parseHubCategory(raw: unknown): string | null {
  return normalizeTopicSlug(raw);
}

/** Categories from hub metadata — `categories[]` only (capped at one). */
export function parseHubCategories(meta: {
  categories?: unknown;
}): string[] {
  return Array.isArray(meta.categories)
    ? normalizeTopicList(meta.categories, HUB_MAX_CATEGORIES)
    : [];
}

export function hubCategoryLabel(
  category: string | null | undefined
): string | null {
  return topicLabel(category, HUB_CATEGORY_SUGGESTIONS);
}

export function hubCategoriesLabel(categories: string[]): string | null {
  if (categories.length === 0) return null;
  return categories
    .map((slug) => hubCategoryLabel(slug) ?? slug)
    .filter(Boolean)
    .join(' · ');
}

/** Hub metadata — sole entry is the directory browse category. */
export function hubCategoriesMetadataFields(categories: string[]): {
  categories: string[];
} {
  return {
    categories: normalizeTopicList(categories, HUB_MAX_CATEGORIES),
  };
}

/**
 * Discover browse chips: All + curated categories that appear on hubs,
 * sorted by use count (desc). Empty curated cats are omitted.
 */
export function hubDiscoverCategoryFilters(
  categoryCounts: ReadonlyMap<string, number> | Record<string, number>
): ReadonlyArray<{ id: HubCategoryFilter; label: string }> {
  const counts =
    categoryCounts instanceof Map
      ? categoryCounts
      : new Map(Object.entries(categoryCounts));

  const used = HUB_CATEGORY_SUGGESTIONS.map((entry) => ({
    id: entry.id as HubCategoryFilter,
    label: entry.label,
    count: counts.get(entry.id) ?? 0,
  }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return [
    { id: 'all', label: 'All' },
    ...used.map(({ id, label }) => ({ id, label })),
  ];
}

/** Count primary hub categories from a directory sample. */
export function countHubPrimaryCategories(
  apps: ReadonlyArray<{ category: string | null }>
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const app of apps) {
    const slug = app.category?.trim();
    if (!slug) continue;
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return counts;
}
