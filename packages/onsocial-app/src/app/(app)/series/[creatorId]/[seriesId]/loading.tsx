'use client';

import { useParams } from 'next/navigation';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { APP_MARKET_PATH, marketCreatorPath } from '@/lib/app-routes';

export default function SeriesLoading() {
  const params = useParams<{ creatorId?: string }>();
  const creatorId =
    typeof params.creatorId === 'string'
      ? decodeURIComponent(params.creatorId)
      : '';
  const backHref = creatorId ? marketCreatorPath(creatorId) : APP_MARKET_PATH;

  return (
    <OsAppScreen title="Series" backFallbackHref={backHref} glassChrome>
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
