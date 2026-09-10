import type { DropsSort } from '@/features/drops/drops-data';

/** Keep the route shell and client cold state at the same first-page height. */
export const DROPS_CATALOG_SKELETON_ROWS = 5;

export const DROPS_SORT_LABELS: ReadonlyArray<{
  id: DropsSort;
  label: string;
}> = [
  { id: 'live', label: 'Live' },
  { id: 'closing', label: 'Closing' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'new', label: 'New' },
  { id: 'loved', label: 'Loved' },
  { id: 'traded', label: 'Traded' },
  { id: 'finished', label: 'Finished' },
  { id: 'saved', label: 'Saved' },
];

export function dropsSortLabel(sort: DropsSort): string {
  return DROPS_SORT_LABELS.find((entry) => entry.id === sort)?.label ?? 'Drops';
}
