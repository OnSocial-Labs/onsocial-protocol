/** Discover hub tabs — People stays default; topics/tickers browse in-hub. */
export type DiscoverTab = 'people' | 'topics' | 'tickers';

export const DISCOVER_TABS: readonly DiscoverTab[] = [
  'people',
  'topics',
  'tickers',
] as const;

export const DISCOVER_TAB_QUERY_KEY = 'tab';

export function parseDiscoverTab(
  raw: string | null | undefined
): DiscoverTab {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'topics' || value === 'tickers') return value;
  return 'people';
}

export function discoverTabLabel(tab: DiscoverTab): string {
  switch (tab) {
    case 'topics':
      return 'Topics';
    case 'tickers':
      return 'Tickers';
    default:
      return 'People';
  }
}

/** Sync `?tab=` — omit when people (default) to keep URLs clean. */
export function applyDiscoverTabParam(
  params: URLSearchParams,
  tab: DiscoverTab
): void {
  if (tab === 'people') {
    params.delete(DISCOVER_TAB_QUERY_KEY);
  } else {
    params.set(DISCOVER_TAB_QUERY_KEY, tab);
  }
}

/**
 * When the user types `#` / `$`, switch to the matching tab.
 * Bare text leaves the current tab alone.
 */
export function discoverTabForQueryDraft(
  raw: string,
  current: DiscoverTab
): DiscoverTab {
  const trimmed = raw.trim();
  if (trimmed.startsWith('$')) return 'tickers';
  if (trimmed.startsWith('#')) return 'topics';
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
