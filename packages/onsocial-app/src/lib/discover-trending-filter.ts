import type { DiscoverScarcePeek } from '@/features/discover/discover-scarce-peeks';
import { placeLabel } from '@/lib/post-place';
import { discoverPeopleSearchQuery } from '@/features/discover/discover-omni-search';
import type {
  DiscoverTrendingDao,
  DiscoverTrendingGuild,
  DiscoverTrendingHub,
} from '@/lib/discover-trending-server';
import { daoPath, daoPortfolioPath } from '@/lib/app-routes';
import type { ProfileListAccount } from '@/lib/profile-list-account';
import type {
  DiscoverFaceFilter,
  GovernanceEventRow,
  HashtagCount,
  PlaceCount,
  PostRow,
  TickerCount,
} from '@onsocial/sdk';

/** Case-insensitive substring match for Discover Moving peeks. */
export function matchesDiscoverTrendingQuery(
  haystack: string,
  query: string
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle);
}

/** Bare people query for Moving filters (`#`/`$` drafts → no filter). */
export function discoverTrendingFilterQuery(raw: string): string {
  return discoverPeopleSearchQuery(raw);
}

export function filterTrendingTickers(
  rows: TickerCount[],
  query: string
): TickerCount[] {
  const needle = discoverTrendingFilterQuery(query);
  if (!needle) return rows;
  return rows.filter((row) => matchesDiscoverTrendingQuery(row.ticker, needle));
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
  query: string,
  face: DiscoverFaceFilter = 'all',
  industry = ''
): ProfileListAccount[] {
  const needle = discoverTrendingFilterQuery(query);
  const sector = face === 'people' ? '' : industry.trim().toLowerCase();
  return rows.filter((row) => {
    if (face === 'people' && row.kind && row.kind !== 'person') return false;
    if ((face === 'orgs' || face === 'hiring') && row.kind !== 'org') {
      return false;
    }
    if (face === 'daos' && row.kind !== 'dao') {
      return false;
    }
    if (face === 'hiring' && !(row.openJobsCount && row.openJobsCount > 0)) {
      return false;
    }
    if (sector && (row.industry ?? '').trim().toLowerCase() !== sector) {
      return false;
    }
    if (!needle) return true;
    const name = row.name?.trim() || '';
    const industryText = row.industry?.trim() || '';
    return (
      matchesDiscoverTrendingQuery(row.accountId, needle) ||
      (name.length > 0 && matchesDiscoverTrendingQuery(name, needle)) ||
      (industryText.length > 0 &&
        matchesDiscoverTrendingQuery(industryText, needle))
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

export function filterTrendingPosts(rows: PostRow[], query: string): PostRow[] {
  const needle = discoverTrendingFilterQuery(query);
  if (!needle) return rows;
  return rows.filter((row) => {
    const name = row.authorName?.trim() || '';
    return (
      matchesDiscoverTrendingQuery(row.accountId, needle) ||
      (name.length > 0 && matchesDiscoverTrendingQuery(name, needle)) ||
      matchesDiscoverTrendingQuery(row.value, needle)
    );
  });
}

export function filterTrendingDrops(
  rows: DiscoverScarcePeek[],
  query: string
): DiscoverScarcePeek[] {
  const needle = discoverTrendingFilterQuery(query);
  if (!needle) return rows;
  return rows.filter((row) => {
    const title = row.title?.trim() || '';
    const appId = row.appId?.trim() || '';
    return (
      matchesDiscoverTrendingQuery(row.collectionId, needle) ||
      (title.length > 0 && matchesDiscoverTrendingQuery(title, needle)) ||
      (appId.length > 0 && matchesDiscoverTrendingQuery(appId, needle))
    );
  });
}

export function filterTrendingProposals(
  rows: GovernanceEventRow[],
  query: string
): GovernanceEventRow[] {
  const needle = discoverTrendingFilterQuery(query);
  if (!needle) return rows;
  return rows.filter((row) => {
    const title = row.title?.trim() || '';
    const groupId = row.groupId?.trim() || '';
    return (
      (title.length > 0 && matchesDiscoverTrendingQuery(title, needle)) ||
      (groupId.length > 0 && matchesDiscoverTrendingQuery(groupId, needle))
    );
  });
}

/** Portfolio deep-link when we have a proposal number; else the DAO home. */
export function discoverProposalHref(row: {
  groupId: string | null;
  sequenceNumber: number | null;
}): string | null {
  const groupId = row.groupId?.trim();
  if (!groupId) return null;
  const n = row.sequenceNumber;
  if (typeof n === 'number' && Number.isInteger(n) && n >= 0) {
    return daoPortfolioPath(groupId, { proposal: n });
  }
  return daoPath(groupId);
}
