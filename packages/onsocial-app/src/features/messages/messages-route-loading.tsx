import { OsAppChromePage } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { APP_HOME_PATH } from '@/lib/app-routes';

/**
 * Cold `/messages` chrome only. Inbox / thread skeletons stay inside
 * `MessagesPanel` after connect, session, and key unlock — a route fallback
 * must not flash conversation bones over those gates.
 */
export function MessagesRouteLoading() {
  return (
    <OsAppScreen
      title="Messages"
      compactChrome
      dockBack
      backFallbackHref={APP_HOME_PATH}
      leading={null}
      glassChrome
      heading={<p className="os-app-screen-title">Messages</p>}
    >
      <OsAppChromePage className="messages-panel" aria-busy="true">
        <p className="sr-only">Loading messages…</p>
      </OsAppChromePage>
    </OsAppScreen>
  );
}
