import { placeLabel } from '@/lib/post-place';
import { discoverPeopleSearchQuery } from '@/features/discover/discover-omni-search';
import type {
  DiscoverTrendingDao,
  DiscoverTrendingGuild,
  DiscoverTrendingHub,
} from '@/lib/discover-trending-server';
import type { ProfileListAccount } from '@/lib/profile-list-account';
import type { HashtagCount, PlaceCount, TickerCount } from '@onsocial/sdk';

/** Case-insensitive substring match for Discover Trending peeks. */
export function matchesDiscoverTrendingQuery(
  haystack: string,
  query: string
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle);
}

/** Bare people query for Trending filters (`#`/`$` drafts → no filter). */
export function discoverTrendingFilterQuery(raw: string): string {
  return discoverPeopleSearchQuery(raw);
}

export function filterTrendingTickers(
  rows: TickerCount[],
  query: string
): TickerCount[] {
  const needle = discoverTrendingFilterQuery(query);
  if (!needle) return rows;
  return rows.filter((row) =>
    matchesDiscoverTrendingQuery(row.ticker, needle)
  );
}

export function filterTrendingTopics(
  rows: HashtagCount[],
  query: string
): HashtagCount[] {
  const needle = discoverTrendingFilterQuery(query);
  if (!needle) return rows;
  return rows.filter((row) =>
    matchesDiscoverTrendingQuery(row.hashtag, needle)
  );
}

export function filterTrendingPlaces(
  rows: PlaceCount[],
  query: string
): PlaceCount[] {
  const needle = discoverTrendingFilterQuery(query);
  if (!needle) return rows;
  return rows.filter((row) => {
    const label = placeLabel(row.place) ?? row.place;
    return (
      matchesDiscoverTrendingQuery(row.place, needle) ||
      matchesDiscoverTrendingQuery(label, needle)
    );
  });
}

export function filterTrendingProfiles(
  rows: ProfileListAccount[],
  query: string
): ProfileListAccount[] {
  const needle = discoverTrendingFilterQuery(query);
  if (!needle) return rows;
  return rows.filter((row) => {
    const name = row.name?.trim() || '';
    return (
      matchesDiscoverTrendingQuery(row.accountId, needle) ||
      (name.length > 0 && matchesDiscoverTrendingQuery(name, needle))
    );
  });
}

export function filterTrendingDaos(
  rows: DiscoverTrendingDao[],
  query: string
): DiscoverTrendingDao[] {
  const needle = discoverTrendingFilterQuery(query);
  if (!needle) return rows;
  return rows.filter((row) => {
    const name = row.name?.trim() || '';
    return (
      matchesDiscoverTrendingQuery(row.daoAccountId, needle) ||
      (name.length > 0 && matchesDiscoverTrendingQuery(name, needle))
    );
  });
}

export function filterTrendingGuilds(
  rows: DiscoverTrendingGuild[],
  query: string
): DiscoverTrendingGuild[] {
  const needle = discoverTrendingFilterQuery(query);
  if (!needle) return rows;
  return rows.filter((row) => {
    const name = row.groupName?.trim() || '';
    return (
      matchesDiscoverTrendingQuery(row.groupId, needle) ||
      (name.length > 0 && matchesDiscoverTrendingQuery(name, needle))
    );
  });
}

export function filterTrendingHubs(
  rows: DiscoverTrendingHub[],
  query: string
): DiscoverTrendingHub[] {
  const needle = discoverTrendingFilterQuery(query);
  if (!needle) return rows;
  return rows.filter((row) => {
    const title = row.title?.trim() || '';
    return (
      matchesDiscoverTrendingQuery(row.appId, needle) ||
      (title.length > 0 && matchesDiscoverTrendingQuery(title, needle))
    );
  });
}
