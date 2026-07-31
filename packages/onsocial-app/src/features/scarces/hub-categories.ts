import {
  normalizeTopicList,
  normalizeTopicSlug,
  topicLabel,
} from '@/lib/topic-slug';

/**
 * Suggested hub categories (chips). Users can type any category slug —
 * primary (= categories[0]) powers directory browse/filter.
 */
export const HUB_CATEGORY_SUGGESTIONS = [
  { id: 'music', label: 'Music' },
  { id: 'art', label: 'Art' },
  { id: 'books', label: 'Books' },
  { id: 'fashion', label: 'Fashion' },
  { id: 'games', label: 'Games' },
  { id: 'film', label: 'Film' },
] as const;

export type HubCategory = string;
export type HubCategoryFilter = 'all' | string;

export const HUB_MAX_CATEGORIES = 2;

export function parseHubCategory(raw: unknown): string | null {
  return normalizeTopicSlug(raw);
}

/** Categories from hub metadata — `categories[]` only. */
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

/** Hub metadata — first entry is primary for directory browse. */
export function hubCategoriesMetadataFields(categories: string[]): {
  categories: string[];
} {
  return {
    categories: normalizeTopicList(categories, HUB_MAX_CATEGORIES),
  };
}

export const HUB_CATEGORY_FILTERS: ReadonlyArray<{
  id: HubCategoryFilter;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  ...HUB_CATEGORY_SUGGESTIONS.map((entry) => ({
    id: entry.id as HubCategoryFilter,
    label: entry.label,
  })),
];
