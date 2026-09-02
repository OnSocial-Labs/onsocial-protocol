import { DropsLoadingScreen } from '@/features/drops/drops-loading-screen';

/** First entry from another route. Sort / medium replaces must not remount the panel. */
export default function DropsLoading() {
  return <DropsLoadingScreen />;
}
