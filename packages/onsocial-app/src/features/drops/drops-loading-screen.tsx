import { OsAppScreen } from '@/components/app/os-app-screen';
import {
  DropsLoadingActions,
  DropsSearchHeading,
} from '@/features/drops/drops-heading';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import { APP_MARKET_PATH } from '@/lib/app-routes';

/** Full Drops shell for route `loading.tsx` + Suspense — same chrome as ready. */
export function DropsLoadingScreen() {
  return (
    <OsAppScreen
      title="Drops"
      compactChrome
      glassChrome
      backFallbackHref={APP_MARKET_PATH}
      heading={<DropsSearchHeading interactive={false} />}
      actions={<DropsLoadingActions />}
    >
      <div className="drops-screen-body">
        <div aria-hidden className="os-chrome-glass" />
        <div
          className="market-page-body drops-page-body"
          aria-busy="true"
          aria-live="polite"
        >
          <p className="sr-only">Loading drops…</p>
          <div className="market-section">
            <MarketListSkeleton rows={6} />
          </div>
        </div>
      </div>
    </OsAppScreen>
  );
}
