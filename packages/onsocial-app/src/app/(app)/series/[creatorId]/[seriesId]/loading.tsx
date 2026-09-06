import { OsAppScreen } from '@/components/app/os-app-screen';
import { SeriesPageSkeleton } from '@/features/scarces/series-page-skeleton';
import { APP_MARKET_PATH } from '@/lib/app-routes';

export default function SeriesLoading() {
  return (
    <OsAppScreen
      title="Series"
      dockBack
      backFallbackHref={APP_MARKET_PATH}
      glassChrome
    >
      <div className="market-page">
        <SeriesPageSkeleton />
      </div>
    </OsAppScreen>
  );
}
