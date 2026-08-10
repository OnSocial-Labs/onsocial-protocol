import { OsAppScreen } from '@/components/app/os-app-screen';
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
      leading={null}
      glassChrome
      heading={<MarketSearchHeading interactive={false} />}
      actions={<MarketLoadingActions />}
    >
      <div aria-hidden className="os-chrome-glass" />
      <div className="market-page" aria-busy="true" aria-live="polite">
        <p className="sr-only">Loading listings…</p>
        <div className="market-section">
          <MarketListSkeleton rows={6} />
        </div>
      </div>
    </OsAppScreen>
  );
}
