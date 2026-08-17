import { OsAppScreen } from '@/components/app/os-app-screen';
import { APP_MARKET_PATH } from '@/lib/app-routes';

export default function CollectionDoorLoading() {
  return (
    <OsAppScreen title="Admit" backFallbackHref={APP_MARKET_PATH} glassChrome>
      <div className="market-page ticket-door-page">
        <div className="market-page-empty">
          <p className="market-page-empty-copy">Opening door…</p>
        </div>
      </div>
    </OsAppScreen>
  );
}
