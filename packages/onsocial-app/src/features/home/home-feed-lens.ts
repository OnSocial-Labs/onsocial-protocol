export type HomeFeedLens = 'pulse' | 'circle' | 'global' | 'saved';

export const HOME_FEED_LENS_STORAGE_KEY = 'onsocial.home.feed-lens';

/** All supported lenses (including hidden ones). */
export const HOME_FEED_LENSES: readonly HomeFeedLens[] = [
  'pulse',
  'circle',
  'global',
  'saved',
] as const;

/** Flip to `true` to show the Circle chip beside Pulse on Home. */
export const HOME_FEED_CIRCLE_LENS_ENABLED = false;

/** Chip rail — Circle omitted while `HOME_FEED_CIRCLE_LENS_ENABLED` is false. */
export function homeFeedVisibleLenses(
  socialAvailable: boolean
): readonly HomeFeedLens[] {
  if (!socialAvailable) return ['global'];
  return HOME_FEED_CIRCLE_LENS_ENABLED
    ? ['pulse', 'circle', 'global', 'saved']
    : ['pulse', 'global', 'saved'];
}

export function homeFeedLensLabel(lens: HomeFeedLens): string {
  switch (lens) {
    case 'pulse':
      return 'Pulse';
    case 'circle':
      return 'Circle';
    case 'global':
      return 'Global';
    case 'saved':
      return 'Saved';
  }
}

export function homeFeedLensSubtitle(lens: HomeFeedLens): string {
  switch (lens) {
    case 'pulse':
      return 'People you stand with — and where they show up.';
    case 'circle':
      return 'Posts from you and people you stand with only.';
    case 'global':
      return 'Recent posts across OnSocial.';
    case 'saved':
      return 'Posts you bookmarked for later.';
  }
}

export function homeFeedLensEmptyCopy(lens: HomeFeedLens): string {
  switch (lens) {
    case 'pulse':
      return 'Nothing in your pulse yet.';
    case 'circle':
      return 'No posts from your circle yet.';
    case 'global':
      return 'No posts yet. Be the first to share something.';
    case 'saved':
      return 'No saved posts yet. Tap the bookmark on a post to save it.';
  }
}

export function homeFeedLensDescription(lens: HomeFeedLens): string {
  switch (lens) {
    case 'pulse':
      return 'Your stood-with network, with soft edges';
    case 'circle':
      return 'You and people you stand with';
    case 'global':
      return 'Everyone on OnSocial';
    case 'saved':
      return 'Your bookmarked posts';
  }
}

function normalizeStoredHomeFeedLens(value: string | null): HomeFeedLens | null {
  if (value === 'standing') return 'pulse';
  if (value === 'pulse' || value === 'global' || value === 'saved') {
    return value;
  }
  if (value === 'circle') {
    return HOME_FEED_CIRCLE_LENS_ENABLED ? 'circle' : 'pulse';
  }
  return null;
}

/** Connected default Pulse; guests stay on Global. Saved requires wallet. */
export function resolveHomeFeedLens(
  requested: HomeFeedLens,
  isConnected: boolean
): HomeFeedLens {
  if (!isConnected) return 'global';
  if (requested === 'circle' && !HOME_FEED_CIRCLE_LENS_ENABLED) {
    return 'pulse';
  }
  return requested;
}

export function readStoredHomeFeedLens(isConnected: boolean): HomeFeedLens {
  if (!isConnected || typeof window === 'undefined') return 'global';
  try {
    const value = window.sessionStorage.getItem(HOME_FEED_LENS_STORAGE_KEY);
    const normalized = normalizeStoredHomeFeedLens(value);
    if (normalized) return normalized;
  } catch {
    /* private mode / denied */
  }
  return 'pulse';
}

export function writeStoredHomeFeedLens(lens: HomeFeedLens): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(HOME_FEED_LENS_STORAGE_KEY, lens);
  } catch {
    /* private mode / denied */
  }
}
