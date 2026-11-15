import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OsAppChromePage, OsAppChromePageStatus } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { MessagesPanel } from '@/features/messages/messages-panel';
import { APP_HOME_PATH } from '@/lib/app-routes';

export const metadata: Metadata = {
  title: 'Messages • OnSocial',
  description: 'Private encrypted messages between OnSocial accounts.',
};

function MessagesFallback() {
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
      <OsAppChromePage className="messages-panel">
        <OsAppChromePageStatus>Loading…</OsAppChromePageStatus>
      </OsAppChromePage>
    </OsAppScreen>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<MessagesFallback />}>
      <MessagesPanel />
    </Suspense>
  );
}
