import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CollectiblesPagePanel } from '@/features/collectibles/collectibles-page-panel';
import { loadCollectiblesPageData } from '@/lib/load-collectibles-page';

export const metadata: Metadata = {
  title: 'Collectibles • OnSocial',
  description: 'Your Collectibles vault — read, play, and open what you hold.',
};

export default async function CollectiblesPage() {
  // Wallet is client-only today — shell SSR; cache paints when warmed.
  const initial = await loadCollectiblesPageData(null);

  return (
    <Suspense fallback={null}>
      <CollectiblesPagePanel
        initialAccountId={initial.accountId}
        initialHoldings={initial.holdings}
      />
    </Suspense>
  );
}
