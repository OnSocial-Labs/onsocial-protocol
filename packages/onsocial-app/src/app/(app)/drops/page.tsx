import { Suspense } from 'react';
import type { Metadata } from 'next';
import { DropsLoadingScreen } from '@/features/drops/drops-loading-screen';
import { DropsPagePanel } from '@/features/drops/drops-page-panel';
import {
  DROPS_PAGE_SIZE,
  fetchDropsPage,
} from '@/features/drops/drops-data';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

export const metadata: Metadata = {
  title: 'Drops • OnSocial',
  description: 'Discover live, upcoming, and loved drops on OnSocial.',
};

export default async function DropsPage() {
  const client = createServerOnSocialClient();
  const page = await fetchDropsPage({
    sort: 'live',
    limit: DROPS_PAGE_SIZE,
    client,
  }).catch(() => ({ items: [], hasMore: false }));

  return (
    <Suspense fallback={<DropsLoadingScreen />}>
      <DropsPagePanel
        initialSort="live"
        initialItems={page.items}
        initialCreators={[]}
      />
    </Suspense>
  );
}
