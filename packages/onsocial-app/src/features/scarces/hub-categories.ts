import {
  normalizeTopicList,
  normalizeTopicSlug,
  topicLabel,
  discoverTopicFiltersFromCounts,
  countPrimaryTopics,
  formatTopicDraftInput,
  TOPIC_MAX_LENGTH,
} from '@/lib/topic-slug';
import { COMMUNITY_TOPIC_SUGGESTIONS } from '@/lib/community-topic-suggestions';

/**
 * Suggested hub categories (chips). Users can type any category slug —
 * primary (= categories[0]) powers directory browse/filter.
 */
export const HUB_CATEGORY_SUGGESTIONS = COMMUNITY_TOPIC_SUGGESTIONS;

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

/** Discover chips from used hub primaries (curated + custom). */
export function hubDiscoverCategoryFilters(
  categoryCounts: ReadonlyMap<string, number> | Record<string, number>
): ReadonlyArray<{ id: HubCategoryFilter; label: string }> {
  return discoverTopicFiltersFromCounts(
    categoryCounts,
    HUB_CATEGORY_SUGGESTIONS
  );
}

export function countHubPrimaryCategories(
  apps: ReadonlyArray<{ category: string | null }>
): Map<string, number> {
  return countPrimaryTopics(
    apps.map((app) => ({ topic: app.category }))
  );
}

export { formatTopicDraftInput, TOPIC_MAX_LENGTH };
