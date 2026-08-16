import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MessagesPanel } from '@/features/messages/messages-panel';

export const metadata: Metadata = {
  title: 'Messages • OnSocial',
  description: 'Private encrypted messages between OnSocial accounts.',
};

export default function MessagesPage() {
  return (
    <Suspense fallback={<div className="messages-panel">Loading…</div>}>
      <MessagesPanel />
    </Suspense>
  );
}
