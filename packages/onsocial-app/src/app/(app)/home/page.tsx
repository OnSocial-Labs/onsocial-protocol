import type { Metadata } from 'next';
import { Suspense } from 'react';
import {
  HOME_FEED_COLD_SKELETON_FRAMES,
  PostRowSkeleton,
} from '@/features/home/post-card';
import { parseHomeFeedFocus } from '@/features/home/home-feed-focus';
import { HomeFeedRoute } from '@/features/home/home-feed-route';
import { loadHomeFeedPage } from '@/lib/load-home-feed-page';

export const metadata: Metadata = {
  title: 'Home • OnSocial',
  description: 'Your OnSocial home feed.',
};

type HomePageProps = {
  searchParams?: Promise<{
    tag?: string | string[];
    ticker?: string | string[];
    place?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Cold visit renders the public hot page into the feed session slot.
 * A saved list still wins after hydration. A focused URL skips the hot seed.
 */
export default function HomePage({ searchParams }: HomePageProps) {
  return (
    <Suspense
      fallback={
        <PostRowSkeleton rows={4} frames={HOME_FEED_COLD_SKELETON_FRAMES} />
      }
    >
      <HomeFeedSeed searchParams={searchParams} />
    </Suspense>
  );
}

async function HomeFeedSeed({
  searchParams,
}: {
  searchParams: HomePageProps['searchParams'];
}) {
  const resolved = await searchParams;
  const focus = parseHomeFeedFocus({
    tag: firstParam(resolved?.tag),
    ticker: firstParam(resolved?.ticker),
    place: firstParam(resolved?.place),
  });
  const paint = focus ? null : await loadHomeFeedPage();
  return <HomeFeedRoute paint={paint} />;
}
