export type HomeFeedLens = 'standing' | 'global' | 'saved';

export const HOME_FEED_LENS_STORAGE_KEY = 'onsocial.home.feed-lens';

export const HOME_FEED_LENSES: readonly HomeFeedLens[] = [
  'standing',
  'global',
  'saved',
] as const;

export function homeFeedLensLabel(lens: HomeFeedLens): string {
  switch (lens) {
    case 'standing':
      return 'Standing';
    case 'global':
      return 'Global';
    case 'saved':
      return 'Saved';
  }
}

export function homeFeedLensSubtitle(lens: HomeFeedLens): string {
  switch (lens) {
    case 'standing':
      return 'Posts from you and accounts you stand with.';
    case 'global':
      return 'Recent posts across OnSocial.';
    case 'saved':
      return 'Posts you bookmarked for later.';
  }
}

export function homeFeedLensEmptyCopy(lens: HomeFeedLens): string {
  switch (lens) {
    case 'standing':
      return 'No posts from your standing network yet.';
    case 'global':
      return 'No posts yet. Be the first to share something.';
    case 'saved':
      return 'No saved posts yet. Tap the bookmark on a post to save it.';
  }
}

export function homeFeedLensDescription(lens: HomeFeedLens): string {
  switch (lens) {
    case 'standing':
      return 'You and accounts you stand with';
    case 'global':
      return 'Everyone on OnSocial';
    case 'saved':
      return 'Your bookmarked posts';
  }
}

/** Connected default Standing; guests stay on Global. Saved requires wallet. */
export function resolveHomeFeedLens(
  requested: HomeFeedLens,
  isConnected: boolean
): HomeFeedLens {
  if (!isConnected) return 'global';
  return requested;
}

export function readStoredHomeFeedLens(isConnected: boolean): HomeFeedLens {
  if (!isConnected || typeof window === 'undefined') return 'global';
  try {
    const value = window.sessionStorage.getItem(HOME_FEED_LENS_STORAGE_KEY);
    if (value === 'standing' || value === 'global' || value === 'saved') {
      return value;
    }
  } catch {
    /* private mode / denied */
  }
  return 'standing';
}

export function writeStoredHomeFeedLens(lens: HomeFeedLens): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(HOME_FEED_LENS_STORAGE_KEY, lens);
  } catch {
    /* private mode / denied */
  }
}
