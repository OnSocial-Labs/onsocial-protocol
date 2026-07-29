import {
  normalizeTopicList,
  normalizeTopicSlug,
  topicLabel,
} from '@/lib/topic-slug';

/**
 * Suggested hub categories (chips). Users can type any topic slug —
 * primary topic is the hub category for browse/filter.
 */
export const HUB_TOPIC_SUGGESTIONS = [
  { id: 'music', label: 'Music' },
  { id: 'art', label: 'Art' },
  { id: 'books', label: 'Books' },
  { id: 'fashion', label: 'Fashion' },
  { id: 'games', label: 'Games' },
  { id: 'film', label: 'Film' },
] as const;

/** @deprecated Use HUB_TOPIC_SUGGESTIONS — kept for call sites during migrate. */
export const HUB_CATEGORIES = HUB_TOPIC_SUGGESTIONS;

export type HubCategory = string;
export type HubCategoryFilter = 'all' | string;

export const HUB_MAX_TOPICS = 2;

export function parseHubCategory(raw: unknown): string | null {
  return normalizeTopicSlug(raw);
}

/** Topics from metadata (`topics[]` preferred; fall back to `category`). */
export function parseHubTopics(meta: {
  topics?: unknown;
  category?: unknown;
}): string[] {
  const fromTopics = Array.isArray(meta.topics)
    ? normalizeTopicList(meta.topics, HUB_MAX_TOPICS)
    : [];
  if (fromTopics.length > 0) return fromTopics;
  const fromCategory = normalizeTopicSlug(meta.category);
  return fromCategory ? [fromCategory] : [];
}

export function hubCategoryLabel(
  category: string | null | undefined
): string | null {
  return topicLabel(category, HUB_TOPIC_SUGGESTIONS);
}

export function hubTopicsLabel(topics: string[]): string | null {
  if (topics.length === 0) return null;
  return topics
    .map((slug) => hubCategoryLabel(slug) ?? slug)
    .filter(Boolean)
    .join(' · ');
}

/** Metadata fields: `topics` + legacy `category` (= primary). */
export function hubTopicsMetadataFields(topics: string[]): {
  topics: string[];
  category?: string;
} {
  const normalized = normalizeTopicList(topics, HUB_MAX_TOPICS);
  return {
    topics: normalized,
    ...(normalized[0] ? { category: normalized[0] } : {}),
  };
}

export const HUB_CATEGORY_FILTERS: ReadonlyArray<{
  id: HubCategoryFilter;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  ...HUB_TOPIC_SUGGESTIONS.map((entry) => ({
    id: entry.id as HubCategoryFilter,
    label: entry.label,
  })),
];
