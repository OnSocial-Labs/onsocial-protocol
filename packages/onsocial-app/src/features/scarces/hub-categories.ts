/** Hub focus categories — user-chosen, stored in app metadata `category`. */

export const HUB_CATEGORIES = [
  { id: 'music', label: 'Music' },
  { id: 'art', label: 'Art' },
  { id: 'books', label: 'Books' },
  { id: 'fashion', label: 'Fashion' },
  { id: 'games', label: 'Games' },
  { id: 'film', label: 'Film' },
  { id: 'other', label: 'Other' },
] as const;

export type HubCategory = (typeof HUB_CATEGORIES)[number]['id'];

export type HubCategoryFilter = 'all' | HubCategory;

const HUB_CATEGORY_IDS = new Set<string>(
  HUB_CATEGORIES.map((entry) => entry.id)
);

export function parseHubCategory(raw: unknown): HubCategory | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim().toLowerCase();
  return HUB_CATEGORY_IDS.has(id) ? (id as HubCategory) : null;
}

export function hubCategoryLabel(
  category: HubCategory | null | undefined
): string | null {
  if (!category) return null;
  return HUB_CATEGORIES.find((entry) => entry.id === category)?.label ?? null;
}

export const HUB_CATEGORY_FILTERS: ReadonlyArray<{
  id: HubCategoryFilter;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  ...HUB_CATEGORIES.map((entry) => ({
    id: entry.id as HubCategoryFilter,
    label: entry.label,
  })),
];
