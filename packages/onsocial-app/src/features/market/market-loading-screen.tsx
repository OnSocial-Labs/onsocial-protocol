import { OsAppScreen } from '@/components/app/os-app-screen';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';

/** Full Market shell for route `loading.tsx` + Suspense. */
export function MarketLoadingScreen() {
  return (
    <OsAppScreen title="Market" leading={null} glassChrome>
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
