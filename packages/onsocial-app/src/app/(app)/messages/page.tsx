import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { OsAppChromePage, OsAppChromePageStatus } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { MessagesPanel } from '@/features/messages/messages-panel';

export const metadata: Metadata = {
  title: 'Messages • OnSocial',
  description: 'Private encrypted messages between OnSocial accounts.',
};

/** Android: shrink the layout viewport with the keyboard. iOS ignores this. */
export const viewport: Viewport = {
  interactiveWidget: 'resizes-content',
};

function MessagesFallback() {
  return (
    <OsAppScreen
      title="Messages"
      compactChrome
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
