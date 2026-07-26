import { Suspense } from 'react';
import type { Metadata } from 'next';
import { MarketPagePanel } from '@/features/market/market-page-panel';

export const metadata: Metadata = {
  title: 'Market • OnSocial',
  description: 'Browse and buy Scarces on OnSocial.',
};

export default function MarketPage() {
  return (
    <Suspense fallback={null}>
      <MarketPagePanel />
    </Suspense>
  );
}
