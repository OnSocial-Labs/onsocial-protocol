import { OsAppScreen } from '@/components/app/os-app-screen';
import { APP_HOME_PATH } from '@/lib/app-routes';
import {
  MarketLoadingActions,
  MarketSearchHeading,
} from '@/features/market/market-heading';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';

/** Full Market shell for route `loading.tsx` + Suspense — same chrome as ready. */
export function MarketLoadingScreen() {
  return (
    <OsAppScreen
      title="Market"
      compactChrome
      dockBack
      leading={null}
      backFallbackHref={APP_HOME_PATH}
      glassChrome
      heading={<MarketSearchHeading interactive={false} />}
      actions={<MarketLoadingActions />}
    >
      <div className="market-page" aria-busy="true" aria-live="polite">
        <p className="sr-only">Loading listings…</p>
        <div className="market-section">
          <MarketListSkeleton rows={6} />
        </div>
      </div>
    </OsAppScreen>
  );
}
