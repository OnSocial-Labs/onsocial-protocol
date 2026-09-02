import { MarketLoadingScreen } from '@/features/market/market-loading-screen';

/** First entry from another route. Filter replaces must not remount the panel. */
export default function MarketLoading() {
  return <MarketLoadingScreen />;
}
