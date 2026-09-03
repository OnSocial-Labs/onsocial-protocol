import type { DiscoverFaceFilter } from '@onsocial/sdk';
import type { DiscoverTab } from '@/features/discover/discover-tabs';
import {
  homeHashtagPath,
  parseHashtagCommit,
} from '@/features/home/home-hashtag-search';
import {
  homeTickerPath,
  parseTickerCommit,
} from '@/features/home/home-ticker-search';
import { normalizeProfileSearchQuery } from '@/lib/profile-account-search';

/**
 * Discover omni-search intent.
 *
 * Bare text filters the active Discover tab. Explicit `#` / `$` drafts switch
 * to Topics / Tickers; committing them (Enter) can hand off to the Home
 * focused feed.
 */
export type DiscoverSearchIntent =
  | { kind: 'people' }
  | { kind: 'hashtag'; value: string; href: string }
  | { kind: 'ticker'; value: string; href: string };

/** Draft starts with `#` or `$` — not a people search string. */
export function isDiscoverTopicDraft(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.startsWith('#') || trimmed.startsWith('$');
}

/** Query passed to profile discover APIs; topic drafts stay in browse mode. */
export function discoverPeopleSearchQuery(raw: string): string {
  if (isDiscoverTopicDraft(raw)) return '';
  return normalizeProfileSearchQuery(raw);
}

export function isDiscoverPeopleSearchActive(raw: string): boolean {
  return discoverPeopleSearchQuery(raw).length > 0;
}

/** Empty query only — trending strip hides while drafting `#` / `$`. */
export function showDiscoverTrendingStrip(raw: string): boolean {
  return raw.trim().length === 0;
}

/**
 * Classify a raw Discover query. Only explicit `#…` / `$…` prefixes route to
 * Home focus; everything else (including bare words) is people search.
 */
export function classifyDiscoverSearch(raw: string): DiscoverSearchIntent {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'people' };

  if (trimmed.startsWith('$')) {
    const value = parseTickerCommit(trimmed);
    return value
      ? { kind: 'ticker', value, href: homeTickerPath(value) }
      : { kind: 'people' };
  }

  if (trimmed.startsWith('#')) {
    const value = parseHashtagCommit(trimmed);
    return value
      ? { kind: 'hashtag', value, href: homeHashtagPath(value) }
      : { kind: 'people' };
  }

  return { kind: 'people' };
}

/** Home focus href for a topic/ticker query, or null when it's people search. */
export function discoverOmniTargetHref(raw: string): string | null {
  const intent = classifyDiscoverSearch(raw);
  return intent.kind === 'people' ? null : intent.href;
}

/** Focus placeholder — names the surface. Idle stays `Search`. */
export function discoverSearchFocusHint(
  tab: DiscoverTab,
  face: DiscoverFaceFilter = 'all'
): string {
  if (tab === 'profiles' && face === 'hiring') return 'Role title';
  if (tab === 'daos') return 'DAOs';
  if (tab === 'guilds') return 'Guilds';
  if (tab === 'hubs') return 'Hubs';
  return 'People, #topics, $tickers';
}

export function discoverSearchAriaLabel(
  tab: DiscoverTab,
  face: DiscoverFaceFilter = 'all'
): string {
  if (tab === 'profiles' && face === 'hiring') return 'Search open roles';
  if (tab === 'daos') return 'Search DAOs';
  if (tab === 'guilds') return 'Search guilds';
  if (tab === 'hubs') return 'Search hubs';
  return 'Search people, topics, and tickers';
}
