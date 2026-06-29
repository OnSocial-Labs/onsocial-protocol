import type { Metadata } from 'next';
import { Suspense } from 'react';
import { normalizeProfileSearchQuery } from '@/lib/profile-account-search';
import { DiscoverPagePanel } from '@/features/discover/discover-page-panel';
import { loadDiscoverProfilesPage } from '@/lib/discover-profiles-server';

export const metadata: Metadata = {
  title: 'Discover • OnSocial',
  description: 'Discover profiles on OnSocial.',
};

type DiscoverPageProps = {
  searchParams?: Promise<{
    q?: string | string[];
  }>;
};

export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  const resolvedSearchParams = await searchParams;
  const initialQuery = normalizeProfileSearchQuery(
    Array.isArray(resolvedSearchParams?.q)
      ? resolvedSearchParams.q[0]
      : resolvedSearchParams?.q
  );
  const initialPage = await loadDiscoverProfilesPage(initialQuery, null, 0).catch(
    () => null
  );

  return (
    <Suspense fallback={null}>
      <DiscoverPagePanel initialPage={initialPage} />
    </Suspense>
  );
}
