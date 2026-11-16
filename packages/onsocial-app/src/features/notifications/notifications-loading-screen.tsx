'use client';

import { OsAppChromePage } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { NotificationActivitySkeleton } from '@/features/notifications/notification-activity-rows';
import { APP_HOME_PATH } from '@/lib/app-routes';

/** Route `loading.tsx` — Activity chrome + inbox bones. */
export function NotificationsLoadingScreen() {
  return (
    <OsAppScreen
      title="Activity"
      compactChrome
      glassChrome
      dockBack
      leading={null}
      backFallbackHref={APP_HOME_PATH}
      className="notifications-activity-screen"
      heading={<p className="os-app-screen-title">Activity</p>}
    >
      <OsAppChromePage className="notifications-panel" aria-busy="true">
        <p className="sr-only">Loading activity…</p>
        <NotificationActivitySkeleton />
      </OsAppChromePage>
    </OsAppScreen>
  );
}
