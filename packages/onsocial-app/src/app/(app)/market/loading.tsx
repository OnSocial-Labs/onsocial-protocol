'use client';

import { Suspense } from 'react';
import { MarketLoadingScreen } from '@/features/market/market-loading-screen';

/** First entry from another route. Filter replaces must not remount the panel. */
export default function MarketLoading() {
  return (
    <Suspense fallback={null}>
      <MarketLoadingScreen />
    </Suspense>
  );
}
