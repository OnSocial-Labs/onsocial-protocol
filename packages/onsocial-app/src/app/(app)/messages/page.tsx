import type { Metadata } from 'next';
import { Suspense } from 'react';
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
      subtitle="Private · sealed on your device"
      backFallbackHref={APP_HOME_PATH}
      glassChrome
    >
      <div className="messages-panel">
        <p className="messages-panel-empty">Loading…</p>
      </div>
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
