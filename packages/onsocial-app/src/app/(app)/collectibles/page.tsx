import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CollectiblesOsEntry } from '@/features/collectibles/collectibles-os-entry';
import { loadCollectiblesPageData } from '@/lib/load-collectibles-page';

export const metadata: Metadata = {
  title: 'Collectibles • OnSocial',
  description: 'Collectibles vault — read, play, and open what you hold.',
};

export default async function CollectiblesPage() {
  // Wallet is client-only — disconnected shell; connected clients soft-redirect
  // to `/@you/collectibles`.
  const initial = await loadCollectiblesPageData(null);

  return (
    <Suspense fallback={null}>
      <CollectiblesOsEntry
        initialAccountId={initial.accountId}
        initialHoldings={initial.holdings}
      />
    </Suspense>
  );
}
