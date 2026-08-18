import type { Metadata } from 'next';
import { Suspense } from 'react';
import { parseDiscoverTab } from '@/features/discover/discover-tabs';
import { DiscoverPagePanel } from '@/features/discover/discover-page-panel';
import type { GuildSummaryCardModel } from '@/features/guilds/guild-summary-card';
import { normalizeProfileSearchQuery } from '@/lib/profile-account-search';
import { loadDiscoverProfilesPage } from '@/lib/discover-profiles-server';
import { loadDiscoverTrendingSeed } from '@/lib/discover-trending-server';
import { loadGuildsIndexPage } from '@/lib/load-guilds-index-page';

export const metadata: Metadata = {
  title: 'Discover • OnSocial',
  description: 'Discover profiles on OnSocial.',
};

type DiscoverPageProps = {
  searchParams?: Promise<{
    q?: string | string[];
    tab?: string | string[];
  }>;
};

export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  const resolvedSearchParams = await searchParams;
  const initialQuery = normalizeProfileSearchQuery(
    Array.isArray(resolvedSearchParams?.q)
      ? resolvedSearchParams.q[0]
      : resolvedSearchParams?.q
  );
  const tab = parseDiscoverTab(
    Array.isArray(resolvedSearchParams?.tab)
      ? resolvedSearchParams.tab[0]
      : resolvedSearchParams?.tab
  );

  const needsProfiles =
    tab === 'profiles' || Boolean(initialQuery.trim());
  // Topics/tickers + community tabs share the trending seed for first paint.
  const needsTrending =
    tab === 'trending' ||
    tab === 'profiles' ||
    tab === 'topics' ||
    tab === 'tickers' ||
    tab === 'daos' ||
    tab === 'guilds' ||
    tab === 'hubs';
  const needsGuilds = tab === 'guilds';
  const [initialPage, initialTrending, initialGuilds] = await Promise.all([
    needsProfiles
      ? loadDiscoverProfilesPage(initialQuery, null, 0).catch(() => null)
      : Promise.resolve(null),
    needsTrending ? loadDiscoverTrendingSeed() : Promise.resolve(null),
    needsGuilds
      ? loadGuildsIndexPage().catch(
          () => null as GuildSummaryCardModel[] | null
        )
      : Promise.resolve(null as GuildSummaryCardModel[] | null),
  ]);

  return (
    <Suspense fallback={null}>
      <DiscoverPagePanel
        initialPage={initialPage}
        initialTrending={initialTrending}
        initialGuilds={initialGuilds}
      />
    </Suspense>
  );
}
