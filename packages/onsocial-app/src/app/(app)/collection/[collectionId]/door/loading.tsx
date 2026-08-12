import { OsAppScreen } from '@/components/app/os-app-screen';
import { APP_MARKET_PATH } from '@/lib/app-routes';

export default function CollectionDoorLoading() {
  return (
    <OsAppScreen title="Admit" backFallbackHref={APP_MARKET_PATH} glassChrome>
      <div className="ticket-door-page">
        <p className="ticket-door-page-empty">Opening door…</p>
      </div>
    </OsAppScreen>
  );
}
