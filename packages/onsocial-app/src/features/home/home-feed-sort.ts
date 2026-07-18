import type { FeedSort } from '@onsocial/sdk';

export type HomeFeedSort = FeedSort;

export const HOME_FEED_SORT_STORAGE_KEY = 'onsocial.home.feed-sort';

export const HOME_FEED_SORTS: readonly HomeFeedSort[] = ['hot', 'recent'];

export function homeFeedSortLabel(sort: HomeFeedSort): string {
  return sort === 'hot' ? 'Hot' : 'Recent';
}

export function resolveHomeFeedSort(
  value: string | null | undefined
): HomeFeedSort {
  return value === 'recent' ? 'recent' : 'hot';
}

export function readHomeFeedSort(): HomeFeedSort {
  if (typeof window === 'undefined') return 'hot';
  try {
    return resolveHomeFeedSort(
      window.sessionStorage.getItem(HOME_FEED_SORT_STORAGE_KEY)
    );
  } catch {
    return 'hot';
  }
}

export function writeHomeFeedSort(sort: HomeFeedSort): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(HOME_FEED_SORT_STORAGE_KEY, sort);
  } catch {
    // ignore quota / private mode
  }
}
