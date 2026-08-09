import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProtocolPagePanel } from '@/features/protocol/protocol-page-panel';

export const metadata: Metadata = {
  title: 'Protocol • OnSocial',
  description:
    'OnSocial governance and treasury — proposals, votes, and decision-making.',
};

export default function ProtocolPage() {
  return (
    <Suspense fallback={null}>
      <ProtocolPagePanel />
    </Suspense>
  );
}
