import { OsAppScreen } from '@/components/app/os-app-screen';
import { APP_MARKET_PATH } from '@/lib/app-routes';

export default function CollectionRedeemLoading() {
  return (
    <OsAppScreen
      title="Redeem"
      dockBack
      backFallbackHref={APP_MARKET_PATH}
      glassChrome
    >
      <div className="market-page ticket-door-page">
        <div className="market-page-empty">
          <p className="market-page-empty-copy">Opening redeem…</p>
        </div>
      </div>
    </OsAppScreen>
  );
}
