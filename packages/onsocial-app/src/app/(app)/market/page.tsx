import { Suspense } from 'react';
import type { Metadata } from 'next';
import { MarketPagePanel } from '@/features/market/market-page-panel';
import { loadMarketPageData } from '@/lib/load-market-page';

export const metadata: Metadata = {
  title: 'Market • OnSocial',
  description: 'Browse and buy Scarces on OnSocial.',
};

export default async function MarketPage() {
  const initial = await loadMarketPageData();

  return (
    <Suspense fallback={null}>
      <MarketPagePanel
        initialListings={initial?.listings ?? null}
        initialSales={initial?.sales ?? null}
      />
    </Suspense>
  );
}
