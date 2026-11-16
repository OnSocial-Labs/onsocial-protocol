import { OsAppChromePage } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { MessagesInboxSkeleton } from '@/features/messages/messages-inbox-rows';
import { APP_HOME_PATH } from '@/lib/app-routes';

/** Cold messages — same chrome as `MessagesPanel` before session/keys settle. */
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
        <MessagesInboxSkeleton />
      </OsAppChromePage>
    </OsAppScreen>
  );
}