import type { Metadata } from 'next';
import { Suspense, type ComponentProps } from 'react';
import { HomePagePanel } from '@/features/home/home-feed';
import { loadHomeFeedPage } from '@/lib/load-home-feed-page';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Home • OnSocial',
  description: 'Your OnSocial home feed.',
};

function HomeFeedClient(props: ComponentProps<typeof HomePagePanel> = {}) {
  return (
    <Suspense fallback={null}>
      <HomePagePanel {...props} />
    </Suspense>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomeFeedClient />}>
      <HomeFeedPaintedPage />
    </Suspense>
  );
}

/** SSR / streamed seed. Client back-nav paints the fallback first (session snapshot). */
async function HomeFeedPaintedPage() {
  const paint = await loadHomeFeedPage({ sort: 'hot' });
  return (
    <HomeFeedClient
      initialPage={paint?.page ?? null}
      initialEngagement={paint?.engagement ?? null}
      initialScarceEmbeds={paint?.scarceEmbeds ?? null}
    />
  );
}
