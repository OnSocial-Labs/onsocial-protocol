import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HomePagePanel } from '@/features/home/home-feed';

export const metadata: Metadata = {
  title: 'Home • OnSocial',
  description: 'Your OnSocial home feed.',
};

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePagePanel />
    </Suspense>
  );
}
