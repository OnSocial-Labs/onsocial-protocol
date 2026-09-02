import { CollectiblesLoadingScreen } from '@/features/collectibles/collectibles-loading-screen';

/** First entry from another route. Kind / search replaces must not remount the panel. */
export default function CollectiblesLoading() {
  return <CollectiblesLoadingScreen />;
}
