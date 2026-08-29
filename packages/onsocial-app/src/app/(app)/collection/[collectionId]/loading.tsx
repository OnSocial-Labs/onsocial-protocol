import { OsAppScreen } from '@/components/app/os-app-screen';
import { CollectionPageSkeleton } from '@/features/scarces/collection-page-skeleton';
import { APP_MARKET_PATH } from '@/lib/app-routes';

export default function CollectionLoading() {
  return (
    <OsAppScreen
      title="Drop"
      dockBack
      backFallbackHref={APP_MARKET_PATH}
      immersiveHeader
    >
      <div aria-hidden className="os-chrome-glass" />
      <CollectionPageSkeleton />
    </OsAppScreen>
  );
}
