import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HomePagePanel } from '@/features/home/home-feed';
import { loadHomeFeedPage } from '@/lib/load-home-feed-page';

export const metadata: Metadata = {
  title: 'Home • OnSocial',
  description: 'Your OnSocial home feed.',
};

export default async function HomePage() {
  const initialPage = await loadHomeFeedPage({ sort: 'hot' });

  return (
    <Suspense fallback={null}>
      <HomePagePanel initialPage={initialPage} />
    </Suspense>
  );
}
