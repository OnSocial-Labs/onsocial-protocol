import { DiscoverPagePanel } from '@/features/discover/discover-page-panel';

/** Cold leave from another route. The panel paints its own section skeletons. */
export default function DiscoverLoading() {
  return <DiscoverPagePanel placeholder />;
}
