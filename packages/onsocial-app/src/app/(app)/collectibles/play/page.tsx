import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CollectiblesPlayPanel } from '@/features/collectibles/collectibles-play-panel';

export const metadata: Metadata = {
  title: 'Player • Collectibles • OnSocial',
  description: 'Play music and video from your Collectibles vault.',
};

export default function CollectiblesPlayPage() {
  return (
    <Suspense fallback={null}>
      <CollectiblesPlayPanel />
    </Suspense>
  );
}
