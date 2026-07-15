export type HomeFeedLens = 'standing' | 'global';

export const HOME_FEED_LENS_STORAGE_KEY = 'onsocial.home.feed-lens';

export const HOME_FEED_LENSES: readonly HomeFeedLens[] = [
  'standing',
  'global',
] as const;

export function homeFeedLensLabel(lens: HomeFeedLens): string {
  switch (lens) {
    case 'standing':
      return 'Standing';
    case 'global':
      return 'Global';
  }
}

export function homeFeedLensSubtitle(lens: HomeFeedLens): string {
  switch (lens) {
    case 'standing':
      return 'Posts from you and accounts you stand with.';
    case 'global':
      return 'Recent posts across OnSocial.';
  }
}

export function homeFeedLensEmptyCopy(lens: HomeFeedLens): string {
  switch (lens) {
    case 'standing':
      return 'No posts from your standing network yet.';
    case 'global':
      return 'No posts yet. Be the first to share something.';
  }
}

export function homeFeedLensDescription(lens: HomeFeedLens): string {
  switch (lens) {
    case 'standing':
      return 'You and accounts you stand with';
    case 'global':
      return 'Everyone on OnSocial';
  }
}

/** Connected default Standing; guests stay on Global. */
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
    if (value === 'standing' || value === 'global') return value;
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
