/** Discover hub tabs — Moving (`trending`) is the default mixed landing.
 * Order: movement, people / orgs / communities, then signals.
 */
export type DiscoverTab =
  | 'trending'
  | 'profiles'
  | 'daos'
  | 'guilds'
  | 'hubs'
  | 'topics'
  | 'tickers';

export const DISCOVER_TABS: readonly DiscoverTab[] = [
  'trending',
  'profiles',
  'daos',
  'guilds',
  'hubs',
  'topics',
  'tickers',
] as const;

export const DISCOVER_TAB_QUERY_KEY = 'tab';

/**
 * Parse `?tab=`. Defaults to trending.
 * Legacy `people` maps to profiles.
 */
export function parseDiscoverTab(raw: string | null | undefined): DiscoverTab {
  const value = (raw ?? '').trim().toLowerCase();
  if (
    value === 'topics' ||
    value === 'tickers' ||
    value === 'trending' ||
    value === 'daos' ||
    value === 'guilds' ||
    value === 'hubs'
  ) {
    return value;
  }
  if (value === 'profiles' || value === 'people') return 'profiles';
  return 'trending';
}

export function discoverTabLabel(tab: DiscoverTab): string {
  switch (tab) {
    case 'trending':
      return 'Moving';
    case 'topics':
      return 'Topics';
    case 'tickers':
      return 'Tickers';
    case 'daos':
      return 'DAOs';
    case 'guilds':
      return 'Guilds';
    case 'hubs':
      return 'Hubs';
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

/** Root Discover app href for a tab (`/discover?tab=…`). */
export function appDiscoverTabHref(tab: DiscoverTab): string {
  const params = new URLSearchParams();
  applyDiscoverTabParam(params, tab);
  const qs = params.toString();
  return qs ? `/discover?${qs}` : '/discover';
}

/**
 * One search box, one destination:
 * `#` → Topics, `$` → Tickers, bare text on Moving → Profiles.
 * Other tabs keep the typed query and filter in place.
 */
export function discoverTabForQueryDraft(
  raw: string,
  current: DiscoverTab
): DiscoverTab {
  const trimmed = raw.trim();
  if (trimmed.startsWith('$')) return 'tickers';
  if (trimmed.startsWith('#')) return 'topics';
  if (trimmed && current === 'trending') return 'profiles';
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

/** Factory DAO catalog list tab. */
export function isDiscoverDaosTab(tab: DiscoverTab): boolean {
  return tab === 'daos';
}

/** Public guild browse / search tab. */
export function isDiscoverGuildsTab(tab: DiscoverTab): boolean {
  return tab === 'guilds';
}

/** Creator hubs directory tab. */
export function isDiscoverHubsTab(tab: DiscoverTab): boolean {
  return tab === 'hubs';
}
