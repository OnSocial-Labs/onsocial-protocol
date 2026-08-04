import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CollectiblesPagePanel } from '@/features/collectibles/collectibles-page-panel';

export const metadata: Metadata = {
  title: 'Collectibles • OnSocial',
  description: 'Your Collectibles vault — read, play, and open what you hold.',
};

export default function CollectiblesPage() {
  return (
    <Suspense fallback={null}>
      <CollectiblesPagePanel />
    </Suspense>
  );
}
