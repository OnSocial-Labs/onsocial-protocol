import type { Metadata } from 'next';
import { DropsPagePanel } from '@/features/drops/drops-page-panel';
import {
  DROPS_PAGE_SIZE,
  fetchCreatorLeaders,
  fetchDropsPage,
} from '@/features/drops/drops-data';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

export const metadata: Metadata = {
  title: 'Drops • OnSocial',
  description: 'Discover new, minting, and loved drops on OnSocial.',
};

export default async function DropsPage() {
  const client = createServerOnSocialClient();
  const [page, creators] = await Promise.all([
    fetchDropsPage({
      sort: 'new',
      limit: DROPS_PAGE_SIZE,
      client,
    }).catch(() => ({ items: [], hasMore: false })),
    fetchCreatorLeaders({ limit: 8, client }).catch(() => []),
  ]);

  return (
    <DropsPagePanel
      initialSort="new"
      initialItems={page.items}
      initialCreators={creators}
    />
  );
}
