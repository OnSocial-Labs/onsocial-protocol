'use client';

import { OsAppScreen } from '@/components/app/os-app-screen';
import { APP_HOME_PATH } from '@/lib/app-routes';
import { osCreatePageClassName } from '@/lib/os-create-page';

/**
 * Route `loading.tsx` for create places — chrome + form bones so parent
 * index shells (Guilds / DAOs / Hubs / Drops) never paint over New.
 */
export function CreatePageLoadingScreen({
  title,
  formClassName,
  loadingLabel,
}: {
  title: string;
  formClassName: string;
  loadingLabel: string;
}) {
  return (
    <OsAppScreen
      title={title}
      glassChrome
      dockBack
      backFallbackHref={APP_HOME_PATH}
    >
      <div
        className={osCreatePageClassName(formClassName)}
        aria-busy="true"
        aria-live="polite"
      >
        <p className="sr-only">{loadingLabel}</p>
        <div className="guild-loading-lines" aria-hidden>
          <span className="standing-row-shimmer guild-loading-line" />
          <span className="standing-row-shimmer guild-loading-line-sm" />
          <span className="standing-row-shimmer guild-loading-line" />
        </div>
      </div>
    </OsAppScreen>
  );
}
