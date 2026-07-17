/** Discover hub tabs — Trending is the default mixed landing. */
export type DiscoverTab = 'trending' | 'profiles' | 'topics' | 'tickers';

export const DISCOVER_TABS: readonly DiscoverTab[] = [
  'trending',
  'profiles',
  'topics',
  'tickers',
] as const;

export const DISCOVER_TAB_QUERY_KEY = 'tab';

/**
 * Parse `?tab=`. Defaults to trending.
 * Legacy `people` maps to profiles.
 */
export function parseDiscoverTab(
  raw: string | null | undefined
): DiscoverTab {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'topics' || value === 'tickers' || value === 'trending') {
    return value;
  }
  if (value === 'profiles' || value === 'people') return 'profiles';
  return 'trending';
}

export function discoverTabLabel(tab: DiscoverTab): string {
  switch (tab) {
    case 'trending':
      return 'Trending';
    case 'topics':
      return 'Topics';
    case 'tickers':
      return 'Tickers';
    default:
      return 'Profiles';
  }
}

/** Sync `?tab=` — omit when trending (default) to keep URLs clean. */
export function applyDiscoverTabParam(
  params: URLSearchParams,
  tab: DiscoverTab
): void {
  if (tab === 'trending') {
    params.delete(DISCOVER_TAB_QUERY_KEY);
  } else {
    params.set(DISCOVER_TAB_QUERY_KEY, tab);
  }
}

/**
 * When the user types `#` / `$`, switch to the matching tab.
 * Bare text on Trending jumps to Profiles for live people search.
 */
export function discoverTabForQueryDraft(
  raw: string,
  current: DiscoverTab
): DiscoverTab {
  const trimmed = raw.trim();
  if (trimmed.startsWith('$')) return 'tickers';
  if (trimmed.startsWith('#')) return 'topics';
  if (trimmed.length > 0 && current === 'trending') return 'profiles';
  return current;
}

/** Prefix used to filter topic/ticker lists (strip leading # / $). */
export function discoverTopicFilterPrefix(
  raw: string,
  tab: DiscoverTab
): string {
  const trimmed = raw.trim();
  if (tab === 'tickers') {
    return trimmed.replace(/^\$+/, '').toLowerCase();
  }
  if (tab === 'topics') {
    return trimmed.replace(/^#+/, '').toLowerCase();
  }
  return '';
}

/** People-list fetch only runs on Profiles. */
export function isDiscoverProfilesTab(tab: DiscoverTab): boolean {
  return tab === 'profiles';
}
