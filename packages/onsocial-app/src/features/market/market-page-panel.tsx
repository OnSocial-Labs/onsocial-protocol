'use client';

import Link from 'next/link';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { APP_HOME_PATH } from '@/lib/app-routes';

export function MarketPagePanel() {
  return (
    <OsAppScreen
      title="Market"
      subtitle="Coming soon"
      backFallbackHref={APP_HOME_PATH}
    >
      <div className="app-soon-page">
        <p className="app-soon-copy">
          Browse, mint, and trade Scarces directly from your OnSocial page.
        </p>
        <Link className="app-soon-link" href={APP_HOME_PATH}>
          Back to Home
        </Link>
      </div>
    </OsAppScreen>
  );
}
