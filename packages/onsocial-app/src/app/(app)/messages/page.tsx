import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { MessagesPanel } from '@/features/messages/messages-panel';
import { MessagesRouteLoading } from '@/features/messages/messages-route-loading';

export const metadata: Metadata = {
  title: 'Messages • OnSocial',
  description: 'Private encrypted messages between OnSocial accounts.',
};

/** Android: shrink the layout viewport with the keyboard. iOS ignores this. */
export const viewport: Viewport = {
  interactiveWidget: 'resizes-content',
};

export default function MessagesPage() {
  return (
    <Suspense fallback={<MessagesRouteLoading />}>
      <MessagesPanel />
    </Suspense>
  );
}
