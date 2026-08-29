import { OsAppScreen } from '@/components/app/os-app-screen';
import { APP_MARKET_PATH } from '@/lib/app-routes';

export default function SeriesLoading() {
  return (
    <OsAppScreen
      title="Series"
      dockBack
      backFallbackHref={APP_MARKET_PATH}
      glassChrome
    >
      <div className="market-page series-page">
        <div className="standing-panel-empty-block is-centered">
          <div className="standing-panel-empty-state">
            <p className="standing-panel-empty-primary">Opening series…</p>
          </div>
        </div>
      </div>
    </OsAppScreen>
  );
}
