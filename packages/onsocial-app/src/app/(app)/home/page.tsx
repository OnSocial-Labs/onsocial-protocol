import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HomePagePanel } from '@/features/home/home-feed';

export const metadata: Metadata = {
  title: 'Home • OnSocial',
  description: 'Your OnSocial home feed.',
};

/** Client feed. A server fetch here runs again on every return from an article. */
export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePagePanel />
    </Suspense>
  );
}
